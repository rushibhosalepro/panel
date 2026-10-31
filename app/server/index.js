require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const rubric = require('./rubric');
const { callOpenRouter } = require('./llm');
const agent = require('./agent');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function loadPrompt(name) {
  return fs.readFileSync(path.join(__dirname, 'prompts', name), 'utf8');
}

function numbered(text) {
  return String(text || '').split('\n').map((line, i) => `L${i + 1}: ${line}`).join('\n');
}

function fallback(name) {
  return path.join(__dirname, '..', 'data', 'fallback', name);
}

function validSkills(data) {
  if (!data || !Array.isArray(data.skills)) return false;
  if (data.skills.length < 1 || data.skills.length > 8) return false;
  return data.skills.every((s) => s && typeof s.name === 'string' && rubric.DIMENSIONS.includes(s.dimension));
}

function validScores(data) {
  if (!data || typeof data.scores !== 'object') return false;
  return rubric.DIMENSIONS.every((dim) => {
    const e = data.scores[dim];
    return e && Number.isInteger(e.score) && e.score >= 0 && e.score <= 3 && (e.quote === null || typeof e.quote === 'string');
  });
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/jds', (req, res) => {
  const dir = path.join(__dirname, '..', 'data', 'jds');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
  res.json({ ok: true, jds: files.map((f) => ({ id: f.replace(/\.txt$/, ''), name: f.replace(/\.txt$/, '').replace(/-/g, ' ') })) });
});

app.get('/api/jds/:id', (req, res) => {
  const file = path.join(__dirname, '..', 'data', 'jds', `${req.params.id}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'JD not found' });
  res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
});

app.get('/api/demo/:n', (req, res) => {
  if (req.params.n !== '1' && req.params.n !== '2') return res.status(404).json({ ok: false, error: 'demo 1 or 2 only' });
  res.type('text/plain').send(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo', `round${req.params.n}.txt`), 'utf8'));
});

app.post('/api/reset', (req, res) => res.json(store.reset()));

// Unique across processes: two servers share sessions.json while testing.
function newSessionId() {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

// Resolves the JD text (bundled id or pasted) or returns {status, error}.
function loadJd(jdId, jdText) {
  if (jdId) {
    const file = path.join(__dirname, '..', 'data', 'jds', `${jdId}.txt`);
    if (!fs.existsSync(file)) return { status: 404, error: 'JD not found' };
    return { jd: fs.readFileSync(file, 'utf8'), cacheKey: `jd:${jdId}` };
  }
  if (typeof jdText === 'string' && jdText.trim()) return { jd: jdText, cacheKey: null };
  return { status: 400, error: 'jdId or jdText required' };
}

// JD → skills, cached per bundled JD. Mutates data.jdCache; caller saves.
async function getSkills(data, jd, cacheKey) {
  data.jdCache = data.jdCache || {};
  if (cacheKey && data.jdCache[cacheKey]) return { skills: data.jdCache[cacheKey], skillsFallback: false };
  const r = await callOpenRouter({
    prompt: loadPrompt('skills.txt').replace('{{JD}}', jd),
    kind: 'skills',
    fallbackPath: fallback('skills.json'),
    label: 'skills'
  });
  if (!r.usedFallback && validSkills(r.data)) {
    if (cacheKey) data.jdCache[cacheKey] = r.data.skills;
    return { skills: r.data.skills, skillsFallback: false };
  }
  return { skills: JSON.parse(fs.readFileSync(fallback('skills.json'), 'utf8')).skills, skillsFallback: true };
}

// The committee argues: debate lines written to match votes code already decided.
async function makeDebate(scores, votes, userText, label) {
  const quotes = rubric.DIMENSIONS.map((dim) => scores[dim].quote).filter(Boolean);
  const d = await callOpenRouter({
    prompt: loadPrompt('debate.txt')
      .replace('{{VOTES}}', JSON.stringify(votes))
      .replace('{{SCORES}}', JSON.stringify(scores))
      .replace('{{QUOTES}}', JSON.stringify(quotes)),
    kind: 'debate',
    fallbackPath: fallback('debate.json'),
    label
  });
  const debate = !d.usedFallback ? rubric.sanitizeDebate(d.data, userText) : null;
  if (debate) return { debate, debateFallback: false };
  return {
    debate: rubric.sanitizeDebate(JSON.parse(fs.readFileSync(fallback('debate.json'), 'utf8')), userText) || { lines: [], verdicts: {} },
    debateFallback: true
  };
}

app.post('/api/panel', async (req, res) => {
  try {
    const { role, jdId, jdText } = req.body || {};
    const docs = typeof (req.body || {}).docs === 'string' ? req.body.docs.trim() : '';
    if (!(req.body || {}).input || typeof req.body.input !== 'string') return res.status(400).json({ ok: false, error: 'input (transcript text) required' });
    // A pasted resume / cover letter counts as the candidate's own words.
    const input = docs ? `${req.body.input}\n${docs}` : req.body.input;
    const { jd, cacheKey, status, error } = loadJd(jdId, jdText);
    if (!jd) return res.status(status).json({ ok: false, error });

    const data = store.get();
    const { skills, skillsFallback } = await getSkills(data, jd, cacheKey);

    const s = await callOpenRouter({
      prompt: loadPrompt('score.txt').replace('{{SKILLS}}', JSON.stringify(skills)).replace('{{TRANSCRIPT}}', numbered(input)),
      kind: 'score',
      fallbackPath: fallback('score.json'),
      label: 'score'
    });
    const scoreFallback = s.usedFallback || !validScores(s.data);
    const rawScores = !scoreFallback
      ? s.data.scores
      : JSON.parse(fs.readFileSync(fallback('score.json'), 'utf8')).scores;

    const verified = rubric.verifyScores(rawScores, input);
    const { votes, detail } = rubric.computeVotes(verified);
    const derived = rubric.deriveSkills(skills, verified);
    const { debate, debateFallback } = await makeDebate(verified, votes, input, 'debate');

    const session = {
      id: newSessionId(),
      role: role || 'unspecified',
      jdId: jdId || null,
      rounds: [{ n: 1, input, scores: verified, votes, debate }],
      skills: derived,
      plan: { weeks: [], projects: [] }
    };
    data.sessions.push(session);
    store.save(data);
    res.json({
      ok: true,
      sessionId: session.id,
      skills: derived,
      scores: verified,
      votes,
      detail,
      debate,
      usedFallback: { skills: skillsFallback, score: scoreFallback, debate: debateFallback }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

const FOLLOWUP_Q = {
  ownership: 'tell me about a time you took something from idea to shipped — and what you personally decided',
  user_focus: 'tell me about a time you talked to users and changed your mind because of it',
  impact: 'tell me about a time you measured the outcome of your work with a number',
  tradeoffs: 'tell me about a time you said no to something good to protect something better'
};
const PANEL_NAMES = { product_lead: 'Product Lead', eng_manager: 'Eng Manager', founder: 'Founder' };

app.post('/api/followup', (req, res) => {
  const data = store.get();
  const session = data.sessions.find((s) => s.id === (req.body || {}).sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'session not found' });
  const last = session.rounds[session.rounds.length - 1];
  const { detail } = rubric.computeVotes(last.scores);
  const target = rubric.followupTarget(last.votes, last.scores, detail);
  const q = {
    panelist: target.panelist,
    panelistName: PANEL_NAMES[target.panelist],
    dimension: target.dimension,
    steelman: target.steelman,
    question: `${PANEL_NAMES[target.panelist]}: ${FOLLOWUP_Q[target.dimension]}.`
  };
  session.followup = q;
  store.save(data);
  res.json({ ok: true, ...q });
});

app.post('/api/rescore', async (req, res) => {
  try {
    const { sessionId, answer } = req.body || {};
    const data = store.get();
    const session = data.sessions.find((s) => s.id === sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'session not found' });
    if (!answer || typeof answer !== 'string') return res.status(400).json({ ok: false, error: 'answer text required' });
    const prev = session.rounds[session.rounds.length - 1];
    const fullText = [...session.rounds.map((r) => r.input), answer].join('\n');
    const skillsForPrompt = session.skills.map((s) => ({ name: s.name, dimension: s.dimension }));
    const s = await callOpenRouter({
      prompt: loadPrompt('score.txt').replace('{{SKILLS}}', JSON.stringify(skillsForPrompt)).replace('{{TRANSCRIPT}}', numbered(fullText)),
      kind: 'score',
      fallbackPath: fallback('score-round2.json'),
      label: 'rescore'
    });
    const scoreFallback = s.usedFallback || !validScores(s.data);
    const rawNext = !scoreFallback
      ? s.data.scores
      : JSON.parse(fs.readFileSync(fallback('score-round2.json'), 'utf8')).scores;
    const nextVerified = rubric.verifyScores(rawNext, fullText);
    const merged = rubric.ratchet(prev.scores, nextVerified);
    const { votes, detail } = rubric.computeVotes(merged);
    const derived = rubric.deriveSkills(skillsForPrompt, merged);
    session.skills = rubric.mergeSkills(session.skills, derived);
    const { debate, debateFallback } = await makeDebate(merged, votes, fullText, 'debate2');
    const round = { n: prev.n + 1, input: answer, scores: merged, votes, debate };
    session.rounds.push(round);
    store.save(data);
    res.json({
      ok: true,
      scores: merged,
      votes,
      detail,
      debate,
      diff: rubric.diffVotes(prev.votes, votes),
      changed: rubric.changedDims(prev.scores, merged),
      usedFallback: { score: scoreFallback, debate: debateFallback }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// --- Agent mode: the panel runs the interview itself. Responses are NDJSON:
// {type:'think'|'tool'|'system', ...} lines while it works, then one {type:'result'} or {type:'error'}.

function ndjson(res) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  return (event) => res.write(`${JSON.stringify(event)}\n`);
}

// Snapshot the agent's state as a round and send the result. The debate is what the panel said
// live this turn; only when it said too little does a separate debate get written.
async function finishTurn(session, state, status, input, send, lineStart) {
  const prev = session.rounds[session.rounds.length - 1];
  // Votes always come from the current verified scores, never from the agent's last call.
  const { votes, detail } = rubric.computeVotes(state.scores);
  const live = state.lines.slice(lineStart);
  const debateLive = live.filter((l) => !l.ask).length >= 2;
  let debate = { lines: live, verdicts: {} };
  let debateFallback = false;
  if (!debateLive) {
    send({ type: 'system', text: 'The panel is debating…' });
    ({ debate, debateFallback } = await makeDebate(state.scores, votes, state.texts.join('\n'), `debate-agent${session.rounds.length + 1}`));
  }
  const derived = rubric.deriveSkills(session.skills, state.scores);
  session.skills = rubric.mergeSkills(session.skills, derived);
  session.rounds.push({ n: session.rounds.length + 1, input, scores: state.scores, votes, debate });
  const data = store.get();
  const i = data.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) data.sessions[i] = session;
  else data.sessions.push(session);
  store.save(data);
  send({
    type: 'result',
    ok: true,
    sessionId: session.id,
    status,
    question: state.pending ? { ...state.pending, toolCallId: undefined } : null,
    finishReason: state.finished ? state.finished.reason : null,
    questionsLeft: agent.MAX_QUESTIONS - state.questions,
    skills: session.skills,
    scores: state.scores,
    votes,
    detail,
    debate,
    debateLive,
    qa: state.qa,
    diff: prev ? rubric.diffVotes(prev.votes, votes) : {},
    changed: prev ? rubric.changedDims(prev.scores, state.scores) : [],
    usedFallback: { agent: false, debate: debateFallback }
  });
}

app.post('/api/interview/start', async (req, res) => {
  const { role, jdId, jdText, input } = req.body || {};
  const docs = typeof (req.body || {}).docs === 'string' ? req.body.docs.trim() : '';
  if (!input || typeof input !== 'string') return res.status(400).json({ ok: false, error: 'input (transcript text) required' });
  const { jd, cacheKey, status, error } = loadJd(jdId, jdText);
  if (!jd) return res.status(status).json({ ok: false, error });
  const send = ndjson(res);
  try {
    const data = store.get();
    const { skills } = await getSkills(data, jd, cacheKey);
    store.save(data);
    send({ type: 'system', text: `Read the job description → ${skills.map((s) => s.name).join(', ')}` });
    const state = agent.newAgentState({ role, skills, jd, input, docs });
    const session = {
      id: newSessionId(),
      mode: 'agent',
      role: role || 'unspecified',
      jdId: jdId || null,
      rounds: [],
      skills: skills.map((s) => ({ name: s.name, dimension: s.dimension, status: 'missing', quote: null })),
      plan: { weeks: [], projects: [] },
      agent: state
    };
    const result = await agent.run(state, send);
    await finishTurn(session, state, result, docs ? `${input}\n${docs}` : input, send, 0);
  } catch (e) {
    // The client drops to the deterministic pipeline (/api/panel) on this.
    send({ type: 'error', ok: false, fallback: true, error: String((e && e.message) || e) });
  }
  res.end();
});

app.post('/api/interview/answer', async (req, res) => {
  const { sessionId, answer } = req.body || {};
  const data = store.get();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session || !session.agent) return res.status(404).json({ ok: false, error: 'agent session not found' });
  if (!answer || typeof answer !== 'string') return res.status(400).json({ ok: false, error: 'answer text required' });
  if (!session.agent.pending) return res.status(400).json({ ok: false, error: 'the panel is not waiting for an answer' });
  const send = ndjson(res);
  try {
    const state = session.agent;
    const asker = state.pending.panelistName;
    agent.answer(state, answer);
    send({ type: 'system', text: `${asker} heard your answer` });
    const lineStart = state.lines.length;
    const result = await agent.run(state, send);
    await finishTurn(session, state, result, answer, send, lineStart);
  } catch (e) {
    send({ type: 'error', ok: false, error: String((e && e.message) || e) });
  }
  res.end();
});

app.post('/api/plan', async (req, res) => {
  try {
    const data = store.get();
    const session = data.sessions.find((s) => s.id === (req.body || {}).sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'session not found' });
    const r = await callOpenRouter({
      prompt: loadPrompt('plan.txt')
        .replace('{{ROLE}}', session.role || 'unspecified')
        .replace('{{GAPS}}', JSON.stringify(session.skills)),
      kind: 'plan',
      fallbackPath: fallback('plan.json'),
      label: 'plan'
    });
    let plan = !r.usedFallback ? rubric.sanitizePlan(r.data) : null;
    const planFallback = r.usedFallback || !plan;
    if (!plan) plan = rubric.sanitizePlan(JSON.parse(fs.readFileSync(fallback('plan.json'), 'utf8')));
    session.plan = plan;
    store.save(data);
    const last = session.rounds[session.rounds.length - 1];
    const { votes, detail } = rubric.computeVotes(last.scores);
    // Questions the panel asked, with the candidate's answers (agent mode keeps them; the pipeline has one).
    const qa = session.agent
      ? session.agent.qa
      : session.followup
        ? [{ panelist: session.followup.panelist, dimension: session.followup.dimension, question: session.followup.question.replace(/^[^:]+:\s*/, ''), answer: session.rounds[1] ? session.rounds[1].input : null }]
        : [];
    res.json({ ok: true, gapMap: session.skills, weeks: plan.weeks, projects: plan.projects, votes, detail, scores: last.scores, qa, usedFallback: planFallback });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get('/api/progress', (req, res) => {
  const data = store.get();
  const session = data.sessions.find((s) => s.id === req.query.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'session not found' });
  res.json({
    ok: true,
    rounds: session.rounds.map((r) => ({
      n: r.n,
      scores: Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, v.score])),
      votes: r.votes
    }))
  });
});

app.post('/api/applications', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'text line required' });
    const r = await callOpenRouter({
      prompt: loadPrompt('parse.txt').replace('{{TEXT}}', text),
      kind: 'parse',
      fallbackPath: fallback('application.json'),
      label: 'parse-app'
    });
    let entry = !r.usedFallback ? rubric.sanitizeApplication(r.data) : null;
    const rawFallback = !entry;
    if (!entry) entry = { company: text.slice(0, 80), role: '—', channel: 'other', status: 'applied' };
    entry.date = new Date().toISOString().slice(0, 10);
    const data = store.get();
    data.applications.push(entry);
    store.save(data);
    res.json({ ok: true, entry, rates: rubric.replyRates(data.applications), usedFallback: rawFallback });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get('/api/applications', (req, res) => {
  const data = store.get();
  res.json({ ok: true, applications: data.applications, rates: rubric.replyRates(data.applications) });
});

const port = process.env.PORT || 3100;
app.listen(port, () => console.log(`up on http://localhost:${port}`));
