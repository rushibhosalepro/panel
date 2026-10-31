const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../server/rubric');

const round1 = fs.readFileSync(path.join(__dirname, '..', 'data', 'demo', 'round1.txt'), 'utf8');
const round2 = fs.readFileSync(path.join(__dirname, '..', 'data', 'demo', 'round2.txt'), 'utf8');

const HAND_ROUND1 = {
  ownership: { score: 3, quote: 'I shipped the payments revamp' },
  user_focus: { score: 0, quote: null },
  impact: { score: 3, quote: 'Checkout failures dropped 30%' },
  tradeoffs: { score: 2, quote: 'We said no to the full rewrite' }
};

describe('quote check', () => {
  it('accepts an exact quote', () => {
    assert.equal(R.quoteCheck('I shipped the payments revamp', round1), true);
  });
  it('accepts when the user text has filler around it', () => {
    assert.equal(R.quoteCheck('I shipped it', 'I, uh, shipped it yesterday'), true);
  });
  it('rejects an invented quote', () => {
    assert.equal(R.quoteCheck('I led a team of ten engineers', round1), false);
  });
  it('rejects empty quotes', () => {
    assert.equal(R.quoteCheck('', round1), false);
    assert.equal(R.quoteCheck(null, round1), false);
  });
  it('never strips hedges: "kind of" survives normalization', () => {
    assert.match(R.normalize('I kind of handled the launch'), /kind of/);
    assert.equal(R.quoteCheck('I kind of handled the launch', round1), true);
  });
});

describe('verifyScores', () => {
  it('verifies all hand-written round 1 scores', () => {
    const v = R.verifyScores(HAND_ROUND1, round1);
    for (const dim of R.DIMENSIONS) assert.equal(v[dim].verified, true, dim);
    assert.equal(v.ownership.score, 3);
    assert.equal(v.user_focus.score, 0);
  });
  it('forces an invented quote to 0 with "no evidence"', () => {
    const v = R.verifyScores({ ownership: { score: 3, quote: 'I led a team of ten' } }, round1);
    assert.equal(v.ownership.score, 0);
    assert.equal(v.ownership.verified, false);
    assert.equal(v.ownership.note, 'no evidence');
  });
});

describe('votes: round 1 is 2-1', () => {
  it('PL 1.9 HIRE, EM 2.6 HIRE, Founder vetoed', () => {
    const v = R.verifyScores(HAND_ROUND1, round1);
    const { votes, detail } = R.computeVotes(v);
    assert.deepEqual(votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'NO_HIRE' });
    assert.equal(detail.product_lead.weighted, 1.9);
    assert.equal(detail.eng_manager.weighted, 2.6);
    assert.equal(detail.founder.vetoed, true);
  });
});

describe('follow-up target', () => {
  it('round 1: Founder asks about user_focus', () => {
    const v = R.verifyScores(HAND_ROUND1, round1);
    const { votes, detail } = R.computeVotes(v);
    assert.deepEqual(R.followupTarget(votes, v, detail), { panelist: 'founder', dimension: 'user_focus', steelman: false });
  });
  it('no dissenter: steelman on the lowest dimension', () => {
    const v = R.verifyScores({
      ownership: { score: 2, quote: 'I shipped the payments revamp' },
      user_focus: { score: 2, quote: 'merchants during onboarding' },
      impact: { score: 2, quote: 'failures dropped 30%' },
      tradeoffs: { score: 1, quote: 'said no to the full rewrite' }
    }, `${round1} ${round2}`);
    const { votes, detail } = R.computeVotes(v);
    assert.deepEqual(Object.values(votes), ['HIRE', 'HIRE', 'HIRE']);
    assert.deepEqual(R.followupTarget(votes, v, detail), { panelist: 'product_lead', dimension: 'tradeoffs', steelman: true });
  });
  it('multiple dissenters: closest to flipping asks', () => {
    const v = R.verifyScores({
      ownership: { score: 2, quote: 'I shipped the payments revamp' },
      user_focus: { score: 0, quote: null },
      impact: { score: 0, quote: null },
      tradeoffs: { score: 0, quote: null }
    }, round1);
    const { votes, detail } = R.computeVotes(v);
    const t = R.followupTarget(votes, v, detail);
    assert.equal(t.panelist, 'eng_manager');
    assert.equal(t.dimension, 'impact');
    assert.equal(t.steelman, false);
  });
});

describe('round 2: ratchet flips it to 3-0', () => {
  it('user_focus 0→2 lifts the veto', () => {
    const prev = R.verifyScores(HAND_ROUND1, round1);
    const full = `${round1} ${round2}`;
    const next = R.verifyScores({
      ownership: { score: 2, quote: 'I shipped the payments revamp' },
      user_focus: { score: 2, quote: 'I sat with five merchants during onboarding' },
      impact: { score: 2, quote: 'failures dropped 30%' },
      tradeoffs: { score: 1, quote: 'said no to the full rewrite' }
    }, full);
    const merged = R.ratchet(prev, next);
    assert.equal(merged.ownership.score, 3);
    assert.equal(merged.user_focus.score, 2);
    assert.equal(merged.impact.score, 3);
    assert.equal(merged.tradeoffs.score, 2);
    const { votes, detail } = R.computeVotes(merged);
    assert.deepEqual(votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'HIRE' });
    assert.equal(detail.founder.vetoed, false);
    assert.equal(detail.founder.weighted, 2.4);
  });
});

describe('skill statuses', () => {
  it('derives missing/partial/proven from dimension scores', () => {
    assert.equal(R.skillStatus(0), 'missing');
    assert.equal(R.skillStatus(1), 'partial');
    assert.equal(R.skillStatus(2), 'proven');
    assert.equal(R.skillStatus(3), 'proven');
  });
  it('derives per-skill status with the dimension quote', () => {
    const v = R.verifyScores(HAND_ROUND1, round1);
    const skills = R.deriveSkills([
      { name: 'User research', dimension: 'user_focus' },
      { name: 'Delivery', dimension: 'ownership' }
    ], v);
    assert.deepEqual(skills[0], { name: 'User research', dimension: 'user_focus', status: 'missing', quote: null });
    assert.equal(skills[1].status, 'proven');
    assert.equal(skills[1].quote, 'I shipped the payments revamp');
  });
  it('merges upgrades only, never downgrades', () => {
    const merged = R.mergeSkills(
      [{ name: 'A', dimension: 'ownership', status: 'proven', quote: 'x' }],
      [{ name: 'A', dimension: 'ownership', status: 'partial', quote: 'y' }, { name: 'B', dimension: 'user_focus', status: 'proven', quote: 'z' }]
    );
    assert.equal(merged.find((s) => s.name === 'A').status, 'proven');
    assert.equal(merged.find((s) => s.name === 'B').status, 'proven');
  });
});

describe('sanitizeDebate', () => {
  it('accepts the fallback debate: 7 lines, 3 speakers, real quotes', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fallback', 'debate.json'), 'utf8'));
    const clean = R.sanitizeDebate(data, round1);
    assert.ok(clean);
    assert.equal(clean.lines.length, 7);
    assert.equal(new Set(clean.lines.map((l) => l.panelist)).size, 3);
    assert.equal(clean.lines[0].quote, 'I shipped the payments revamp');
  });
  it('nulls an invented quote but keeps the line', () => {
    const clean = R.sanitizeDebate({ lines: [
      { panelist: 'founder', text: 'No users at all.', quote: 'I led a team of ten' },
      { panelist: 'founder', text: 'Still nothing.', quote: null },
      { panelist: 'product_lead', text: 'Ownership is real.', quote: 'I shipped the payments revamp' },
      { panelist: 'eng_manager', text: 'Agreed.', quote: null }
    ] }, round1);
    assert.ok(clean);
    assert.equal(clean.lines[0].quote, null);
    assert.equal(clean.lines[2].quote, 'I shipped the payments revamp');
  });
  it('rejects garbage: null, too few lines, one speaker', () => {
    assert.equal(R.sanitizeDebate(null, round1), null);
    assert.equal(R.sanitizeDebate({ lines: [{ panelist: 'founder', text: 'Hi', quote: null }] }, round1), null);
    assert.equal(R.sanitizeDebate({ lines: [
      { panelist: 'founder', text: 'One', quote: null },
      { panelist: 'founder', text: 'Two', quote: null },
      { panelist: 'founder', text: 'Three', quote: null },
      { panelist: 'founder', text: 'Four', quote: null }
    ] }, round1), null);
  });
});

describe('vote diff + changed dims', () => {
  it('diffVotes names only the flippers', () => {
    assert.deepEqual(
      R.diffVotes(
        { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'NO_HIRE' },
        { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'HIRE' }
      ),
      { founder: 'NO_HIRE→HIRE' }
    );
  });
  it('changedDims lists score changes only', () => {
    const a = { ownership: { score: 3 }, user_focus: { score: 0 }, impact: { score: 3 }, tradeoffs: { score: 2 } };
    const b = { ownership: { score: 3 }, user_focus: { score: 2 }, impact: { score: 3 }, tradeoffs: { score: 2 } };
    assert.deepEqual(R.changedDims(a, b), ['user_focus']);
  });
});

describe('sanitizePlan', () => {
  it('accepts the fallback plan', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fallback', 'plan.json'), 'utf8'));
    const clean = R.sanitizePlan(data);
    assert.ok(clean);
    assert.equal(clean.weeks.length, 4);
    assert.equal(clean.projects.length, 2);
    assert.ok(clean.weeks[0].tasks.length >= 2);
  });
  it('rejects garbage and caps runaway output', () => {
    assert.equal(R.sanitizePlan(null), null);
    assert.equal(R.sanitizePlan({ weeks: [], projects: [] }), null);
    const big = { weeks: Array.from({ length: 20 }, (_, i) => ({ week: i, focus: 'x', tasks: ['a'] })), projects: [{ title: 'P', gap: 'user_focus', why: 'w' }] };
    assert.equal(R.sanitizePlan(big).weeks.length, 6);
  });
});

describe('applications', () => {
  it('sanitizes a parsed line, coercing bad enums', () => {
    assert.deepEqual(
      R.sanitizeApplication({ company: 'Razorpay', role: 'APM', channel: 'referral', status: 'replied' }),
      { company: 'Razorpay', role: 'APM', channel: 'referral', status: 'replied' }
    );
    assert.deepEqual(
      R.sanitizeApplication({ company: 'X', role: 'Y', channel: 'pigeon', status: 'maybe' }),
      { company: 'X', role: 'Y', channel: 'other', status: 'applied' }
    );
    assert.equal(R.sanitizeApplication({ company: '', role: 'APM' }), null);
  });
  it('computes reply rate by channel in code', () => {
    assert.deepEqual(
      R.replyRates([
        { channel: 'referral', status: 'replied' },
        { channel: 'referral', status: 'ghosted' },
        { channel: 'job-board', status: 'interviewing' }
      ]),
      { referral: { replied: 1, total: 2 }, 'job-board': { replied: 1, total: 1 } }
    );
  });
});
