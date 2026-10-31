// The interview agent: the model chooses what to score, when to ask, and when to stop.
// Every tool it calls is executed by plain code, and the rubric still decides the votes.

const fs = require('fs');
const path = require('path');
const rubric = require('./rubric');
const { chatWithTools } = require('./llm');

const MAX_QUESTIONS = 3;
const MAX_STEPS = 16;
// Lines the panel must debate before it may interrupt with a question (or react before finishing).
const LINES_BEFORE_ASK = 2;
const PANEL_NAMES = { product_lead: 'Product Lead', eng_manager: 'Eng Manager', founder: 'Founder' };
const DIM_NAMES = { ownership: 'ownership', user_focus: 'user focus', impact: 'impact', tradeoffs: 'tradeoffs' };

const why = { type: 'string', description: 'Under 20 words, shown live to the candidate.' };

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'score_evidence',
      description: 'Propose a 0-3 score for one rubric dimension, with the exact quote that justifies it. Code checks the quote against what the candidate said; an unverified quote scores 0.',
      parameters: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: rubric.DIMENSIONS },
          score: { type: 'integer', minimum: 0, maximum: 3 },
          quote: { type: ['string', 'null'], description: "The candidate's exact words, or null when score is 0." },
          why
        },
        required: ['dimension', 'score', 'quote', 'why']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cast_votes',
      description: "Compute each panelist's HIRE / NO_HIRE vote from the verified scores. Returns votes, weighted scores and vetoes.",
      parameters: { type: 'object', properties: { why }, required: ['why'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'panel_say',
      description: "One panelist speaks one line of the live debate, shown to the candidate as it happens. React to specific evidence; the line must agree with that panelist's current vote.",
      parameters: {
        type: 'object',
        properties: {
          panelist: { type: 'string', enum: rubric.PANELISTS },
          text: { type: 'string', description: 'Under 30 words. Sharp, specific, a little funny, never mean.' },
          quote: { type: ['string', 'null'], description: "Exact words of the candidate this line reacts to (under 15 words), or null. Code drops quotes it cannot find." }
        },
        required: ['panelist', 'text', 'quote']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_candidate',
      description: "Ask the candidate one question, in one panelist's voice. The interview pauses until they answer; the answer comes back as this tool's result.",
      parameters: {
        type: 'object',
        properties: {
          panelist: { type: 'string', enum: rubric.PANELISTS },
          dimension: { type: 'string', enum: rubric.DIMENSIONS, description: 'The doubt this question tries to resolve.' },
          question: { type: 'string', description: 'One question, spoken by the panelist, specific to what the candidate said.' },
          why
        },
        required: ['panelist', 'dimension', 'question', 'why']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish_interview',
      description: 'End the interview with the current votes.',
      parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Under 20 words.' } }, required: ['reason'] }
    }
  }
];

function emptyScores() {
  return Object.fromEntries(rubric.DIMENSIONS.map((dim) => [dim, { score: 0, quote: null, verified: true }]));
}

function systemPrompt({ role, skills, jd }) {
  return fs.readFileSync(path.join(__dirname, 'prompts', 'agent.txt'), 'utf8')
    .replace('{{ROLE}}', role || 'unspecified')
    .replace('{{MAX_Q}}', String(MAX_QUESTIONS))
    .replace('{{SKILLS}}', JSON.stringify(skills.map((s) => ({ name: s.name, dimension: s.dimension }))))
    .replace('{{JD}}', jd);
}

function newAgentState({ role, skills, jd, input, docs }) {
  const material = docs ? `\n\nTheir resume / cover letter / other material (also their own words):\n"""\n${docs}\n"""` : '';
  return {
    messages: [
      { role: 'system', content: systemPrompt({ role, skills, jd }) },
      { role: 'user', content: `The candidate's story (dictated, messy):\n"""\n${input}\n"""${material}\nRun the interview.` }
    ],
    texts: docs ? [input, docs] : [input],
    scores: emptyScores(),
    votes: null,
    questions: 0,
    pending: null,
    finished: null,
    lines: [],
    said: 0,
    qa: [],
    trace: []
  };
}

function voteLine(votes) {
  const hires = rubric.PANELISTS.filter((p) => votes[p] === 'HIRE').length;
  const no = rubric.PANELISTS.filter((p) => votes[p] !== 'HIRE').map((p) => PANEL_NAMES[p]);
  return `${hires}–${3 - hires}${no.length ? ` (NO HIRE: ${no.join(', ')})` : ' (unanimous HIRE)'}`;
}

function parseArgs(call) {
  try {
    return JSON.parse(call.function.arguments || '{}');
  } catch (e) {
    return null;
  }
}

// Runs tool calls until the agent asks a question, finishes, or runs out of steps.
async function run(state, emit, chat = chatWithTools) {
  const log = (event) => {
    state.trace.push(event);
    emit(event);
  };
  let nudged = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await chat({ messages: state.messages, tools: TOOLS, kind: 'agent', label: 'agent' });
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    state.messages.push({ role: 'assistant', content: message.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (message.content && message.content.trim()) log({ type: 'think', text: message.content.trim().slice(0, 240) });

    if (!calls.length) {
      if (nudged) break;
      nudged = true;
      state.messages.push({ role: 'user', content: 'Act through the tools. Call finish_interview when you are done.' });
      continue;
    }

    for (const call of calls) {
      const args = parseArgs(call);
      const name = call.function && call.function.name;
      const reply = (result) => state.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      if (!args) {
        reply({ error: 'arguments were not valid JSON' });
        continue;
      }
      if (state.pending) {
        reply({ error: 'the interview is paused for the candidate; this call was not run' });
        continue;
      }

      if (name === 'panel_say') {
        if (!rubric.PANELISTS.includes(args.panelist) || !args.text || !String(args.text).trim()) {
          reply({ error: 'panelist and text are required' });
          continue;
        }
        const quote = args.quote && rubric.quoteCheck(args.quote, state.texts.join('\n')) ? String(args.quote) : null;
        const line = { panelist: args.panelist, text: String(args.text).trim().slice(0, 300), quote };
        state.lines.push(line);
        state.said += 1;
        reply(args.quote && !quote ? { ok: true, quote_dropped: 'not found in what the candidate said' } : { ok: true });
        emit({ type: 'line', ...line });
      } else if (name === 'score_evidence') {
        if (!rubric.DIMENSIONS.includes(args.dimension)) {
          reply({ error: `unknown dimension ${args.dimension}` });
          continue;
        }
        const proposed = { [args.dimension]: { score: Math.max(0, Math.min(3, Number(args.score) || 0)), quote: args.quote || null } };
        const checked = rubric.verifyScores({ ...state.scores, ...proposed }, state.texts.join('\n'))[args.dimension];
        const prev = state.scores[args.dimension];
        state.scores[args.dimension] = (checked.score || 0) >= (prev.score || 0) ? checked : prev;
        if (state.scores[args.dimension].score !== prev.score) state.votesStale = true;
        const rejected = Number(args.score) > 0 && !checked.verified;
        reply(rejected
          ? { accepted: false, score: state.scores[args.dimension].score, error: 'quote not found in what the candidate said; use their exact words or score 0' }
          : { accepted: true, score: state.scores[args.dimension].score });
        log({
          type: 'tool',
          tool: 'score_evidence',
          ok: !rejected,
          text: rejected
            ? `${DIM_NAMES[args.dimension]} → ${args.score}? ✗ quote not found in your words → 0`
            : `${DIM_NAMES[args.dimension]} → ${state.scores[args.dimension].score}/3${checked.quote ? ' ✓ quote verified' : ''}`,
          why: args.why
        });
      } else if (name === 'cast_votes') {
        const { votes, detail } = rubric.computeVotes(state.scores);
        state.votes = votes;
        state.votesStale = false;
        reply({ votes, detail });
        log({ type: 'tool', tool: 'cast_votes', ok: true, text: voteLine(votes), why: args.why, votes });
      } else if (name === 'ask_candidate') {
        if (!state.votes || state.votesStale) {
          reply({ error: 'scores changed since the last vote; call cast_votes before asking' });
        } else if (state.said < LINES_BEFORE_ASK) {
          reply({ error: `let the panel debate first: call panel_say at least ${LINES_BEFORE_ASK} times before interrupting with a question` });
        } else if (state.questions >= MAX_QUESTIONS) {
          reply({ error: 'question limit reached; call finish_interview' });
        } else if (state.pending) {
          reply({ error: 'one question at a time' });
        } else if (!rubric.PANELISTS.includes(args.panelist) || !args.question) {
          reply({ error: 'panelist and question are required' });
        } else {
          state.questions += 1;
          state.pending = {
            toolCallId: call.id,
            panelist: args.panelist,
            panelistName: PANEL_NAMES[args.panelist],
            dimension: rubric.DIMENSIONS.includes(args.dimension) ? args.dimension : null,
            question: String(args.question).slice(0, 400),
            why: args.why || ''
          };
          state.said = 0;
          state.lines.push({ panelist: args.panelist, text: state.pending.question, quote: null, ask: true });
          state.qa.push({ panelist: args.panelist, dimension: state.pending.dimension, question: state.pending.question, answer: null });
          log({ type: 'tool', tool: 'ask_candidate', ok: true, panelist: args.panelist, text: `${PANEL_NAMES[args.panelist]} asks about ${DIM_NAMES[args.dimension] || 'a doubt'}`, why: args.why });
          emit({ type: 'line', panelist: args.panelist, text: state.pending.question, quote: null, ask: true });
        }
      } else if (name === 'finish_interview') {
        if (!state.votes || state.votesStale) {
          reply({ error: 'scores changed since the last vote; call cast_votes before finishing' });
        } else if (state.said < 1) {
          reply({ error: 'the panel has not reacted yet: call panel_say before finishing' });
        } else {
          reply({ ok: true });
          state.finished = { reason: String(args.reason || '').slice(0, 200) };
          log({ type: 'tool', tool: 'finish_interview', ok: true, text: state.finished.reason || 'done' });
        }
      } else {
        reply({ error: `unknown tool ${name}` });
      }
    }

    if (state.pending) return 'asking';
    if (state.finished) return 'done';
  }
  // Out of steps: close the interview on whatever the rubric says now.
  state.votes = rubric.computeVotes(state.scores).votes;
  state.finished = { reason: 'step limit reached' };
  log({ type: 'tool', tool: 'finish_interview', ok: true, text: 'step limit reached' });
  return 'done';
}

function answer(state, text) {
  if (!state.pending) throw new Error('no question is waiting for an answer');
  state.texts.push(text);
  const open = state.qa[state.qa.length - 1];
  if (open && open.answer === null) open.answer = text;
  state.messages.push({
    role: 'tool',
    tool_call_id: state.pending.toolCallId,
    content: JSON.stringify({ candidate_answer: text })
  });
  state.pending = null;
}

module.exports = { newAgentState, run, answer, MAX_QUESTIONS, PANEL_NAMES };
