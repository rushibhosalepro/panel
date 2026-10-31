// Agent-loop evals with a scripted stand-in for the model: no API calls, instant.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const agent = require('../server/agent');

const round1 = fs.readFileSync(path.join(__dirname, '..', 'data', 'demo', 'round1.txt'), 'utf8');
const round2 = fs.readFileSync(path.join(__dirname, '..', 'data', 'demo', 'round2.txt'), 'utf8');
const skills = [
  { name: 'Delivery', dimension: 'ownership' },
  { name: 'User research', dimension: 'user_focus' },
  { name: 'Metrics', dimension: 'impact' },
  { name: 'Prioritization', dimension: 'tradeoffs' }
];

let callId = 0;
function call(name, args) {
  callId += 1;
  return { id: `call_${callId}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

// Replays scripted assistant messages; repeats the last one when the agent keeps going.
function scripted(messages) {
  let i = 0;
  return async () => JSON.parse(JSON.stringify(messages[Math.min(i++, messages.length - 1)]));
}

function fresh() {
  return agent.newAgentState({ role: 'APM', skills, jd: 'test jd', input: round1 });
}

function toolReplies(state) {
  return state.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content));
}

const silent = () => {};
const SCORE = (dimension, score, quote) => ({ content: '', tool_calls: [call('score_evidence', { dimension, score, quote, why: 'test' })] });

describe('agent interview loop', () => {
  it('scores, votes, debates, then asks: round 1 ends 2-1', async () => {
    const state = fresh();
    const chat = scripted([
      { content: '', tool_calls: [
        call('score_evidence', { dimension: 'ownership', score: 3, quote: 'I shipped the payments revamp', why: 'clear ownership' }),
        call('score_evidence', { dimension: 'user_focus', score: 2, quote: 'I led a team of ten', why: 'test invented quote' }),
        call('score_evidence', { dimension: 'impact', score: 3, quote: 'Checkout failures dropped 30%', why: 'hard metric' }),
        call('score_evidence', { dimension: 'tradeoffs', score: 2, quote: 'We said no to the full rewrite', why: 'explicit tradeoff' })
      ] },
      { content: '', tool_calls: [call('cast_votes', { why: 'scores are in' })] },
      { content: '', tool_calls: [
        call('panel_say', { panelist: 'eng_manager', text: 'She ships.', quote: 'I shipped the payments revamp' }),
        call('panel_say', { panelist: 'founder', text: 'But who is the user?', quote: null })
      ] },
      { content: '', tool_calls: [call('ask_candidate', { panelist: 'founder', dimension: 'user_focus', question: 'Tell me about your users?', why: 'red line' })] }
    ]);
    const status = await agent.run(state, silent, chat);
    assert.equal(status, 'asking');
    assert.equal(state.scores.user_focus.score, 0);
    assert.deepEqual(state.votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'NO_HIRE' });
    assert.equal(state.pending.panelist, 'founder');
    assert.equal(state.lines.length, 3);
    const replies = toolReplies(state);
    assert.equal(replies.find((r) => r.accepted === false).error.includes('quote not found'), true);
  });

  it('guards: ask before votes, debate before ask, finish before reaction', async () => {
    const state = fresh();
    const chat = scripted([
      { content: '', tool_calls: [call('ask_candidate', { panelist: 'founder', dimension: 'user_focus', question: 'Q?', why: 'too early' })] },
      { content: '', tool_calls: [call('cast_votes', { why: 'ok' })] },
      { content: '', tool_calls: [call('ask_candidate', { panelist: 'founder', dimension: 'user_focus', question: 'Q?', why: 'still early' })] },
      { content: '', tool_calls: [call('finish_interview', { reason: 'done?' })] }
    ]);
    await agent.run(state, silent, chat);
    const errors = toolReplies(state).filter((r) => r.error).map((r) => r.error);
    assert.ok(errors.some((e) => e.includes('call cast_votes before asking')));
    assert.ok(errors.some((e) => e.includes('let the panel debate first')));
    assert.ok(errors.some((e) => e.includes('has not reacted yet')));
    assert.equal(state.pending, null);
  });

  it('question limit: the 4th ask is refused', async () => {
    const state = fresh();
    const turn = () => ([
      { content: '', tool_calls: [call('cast_votes', { why: 'ok' })] },
      { content: '', tool_calls: [
        call('panel_say', { panelist: 'founder', text: 'Still no users.', quote: null }),
        call('panel_say', { panelist: 'eng_manager', text: 'Ships though.', quote: null })
      ] },
      { content: '', tool_calls: [call('ask_candidate', { panelist: 'founder', dimension: 'user_focus', question: 'Q?', why: 'doubt' })] }
    ]);
    for (let q = 0; q < 3; q++) {
      assert.equal(await agent.run(state, silent, scripted(turn())), 'asking');
      agent.answer(state, `answer ${q}`);
    }
    assert.equal(state.questions, 3);
    await agent.run(state, silent, scripted(turn()));
    const errors = toolReplies(state).filter((r) => r.error).map((r) => r.error);
    assert.ok(errors.some((e) => e.includes('question limit reached')));
  });

  it('answer resumes the loop and a good answer flips the vote', async () => {
    const state = fresh();
    await agent.run(state, silent, scripted([
      { content: '', tool_calls: [
        call('score_evidence', { dimension: 'ownership', score: 3, quote: 'I shipped the payments revamp', why: 't' }),
        call('score_evidence', { dimension: 'impact', score: 3, quote: 'Checkout failures dropped 30%', why: 't' }),
        call('score_evidence', { dimension: 'tradeoffs', score: 2, quote: 'We said no to the full rewrite', why: 't' })
      ] },
      { content: '', tool_calls: [call('cast_votes', { why: 't' })] },
      { content: '', tool_calls: [
        call('panel_say', { panelist: 'founder', text: 'No users.', quote: null }),
        call('panel_say', { panelist: 'eng_manager', text: 'Ships.', quote: null })
      ] },
      { content: '', tool_calls: [call('ask_candidate', { panelist: 'founder', dimension: 'user_focus', question: 'Q?', why: 't' })] }
    ]));
    agent.answer(state, round2);
    assert.equal(state.pending, null);
    assert.equal(state.qa[0].answer, round2);
    const status = await agent.run(state, silent, scripted([
      { content: '', tool_calls: [call('score_evidence', { dimension: 'user_focus', score: 2, quote: 'I sat with five merchants during onboarding', why: 't' })] },
      { content: '', tool_calls: [call('cast_votes', { why: 't' })] },
      { content: '', tool_calls: [call('panel_say', { panelist: 'founder', text: 'Sold.', quote: 'I sat with five merchants during onboarding' })] },
      { content: '', tool_calls: [call('finish_interview', { reason: 'unanimous' })] }
    ]));
    assert.equal(status, 'done');
    assert.deepEqual(state.votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'HIRE' });
  });

  it('step limit forces a deterministic finish on current scores', async () => {
    const state = fresh();
    const status = await agent.run(state, silent, scripted([{ content: 'stalling', tool_calls: [] }]));
    assert.equal(status, 'done');
    assert.equal(state.finished.reason, 'step limit reached');
    assert.deepEqual(state.votes, { product_lead: 'NO_HIRE', eng_manager: 'NO_HIRE', founder: 'NO_HIRE' });
  });

  it('answer() with no pending question throws', () => {
    assert.throws(() => agent.answer(fresh(), 'hello?'), /no question is waiting/);
  });
});
