const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { callOpenRouter } = require('../server/llm');
const R = require('../server/rubric');

const LIVE = Boolean(process.env.OPENROUTER_KEY);
const root = (p) => path.join(__dirname, '..', p);
const round1 = fs.readFileSync(root('data/demo/round1.txt'), 'utf8');
const round2 = fs.readFileSync(root('data/demo/round2.txt'), 'utf8');
const jd = fs.readFileSync(root('data/jds/fintech-apm.txt'), 'utf8');
const numbered = (t) => t.split('\n').map((line, i) => `L${i + 1}: ${line}`).join('\n');

describe('live eval (OpenRouter, costs a fraction of a cent)', () => {
  it('extracts 4-6 JD skills with valid dimensions', { skip: !LIVE }, async () => {
    const prompt = fs.readFileSync(root('server/prompts/skills.txt'), 'utf8').replace('{{JD}}', jd);
    const r = await callOpenRouter({ prompt, kind: 'skills', fallbackPath: root('data/fallback/skills.json'), label: 'eval-skills' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    assert.ok(r.data.skills.length >= 4 && r.data.skills.length <= 6, `got ${r.data.skills.length} skills`);
    for (const s of r.data.skills) assert.ok(R.DIMENSIONS.includes(s.dimension), s.dimension);
  });

  it('scores round 1 as 2-1 with Founder veto', { skip: !LIVE }, async () => {
    const skills = JSON.parse(fs.readFileSync(root('data/fallback/skills.json'), 'utf8')).skills;
    const prompt = fs.readFileSync(root('server/prompts/score.txt'), 'utf8')
      .replace('{{SKILLS}}', JSON.stringify(skills))
      .replace('{{TRANSCRIPT}}', numbered(round1));
    const r = await callOpenRouter({ prompt, kind: 'score', fallbackPath: root('data/fallback/score.json'), label: 'eval-score' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    const v = R.verifyScores(r.data.scores, round1);
    for (const dim of R.DIMENSIONS) assert.equal(v[dim].verified, true, `${dim}: ${v[dim].quote}`);
    assert.equal(v.user_focus.score, 0);
    assert.ok(v.ownership.score >= 2, `ownership ${v.ownership.score}`);
    assert.ok(v.impact.score >= 2, `impact ${v.impact.score}`);
    const { votes } = R.computeVotes(v);
    assert.deepEqual(votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'NO_HIRE' });
  });

  it('live debate: all speak, quotes are real', { skip: !LIVE }, async () => {
    const hand = {
      ownership: { score: 3, quote: 'I shipped the payments revamp' },
      user_focus: { score: 0, quote: null },
      impact: { score: 3, quote: 'Checkout failures dropped 30%' },
      tradeoffs: { score: 2, quote: 'We said no to the full rewrite' }
    };
    const v = R.verifyScores(hand, round1);
    const { votes } = R.computeVotes(v);
    const quotes = R.DIMENSIONS.map((d) => v[d].quote).filter(Boolean);
    const prompt = fs.readFileSync(root('server/prompts/debate.txt'), 'utf8')
      .replace('{{VOTES}}', JSON.stringify(votes))
      .replace('{{SCORES}}', JSON.stringify(v))
      .replace('{{QUOTES}}', JSON.stringify(quotes));
    const r = await callOpenRouter({ prompt, kind: 'debate', fallbackPath: root('data/fallback/debate.json'), label: 'eval-debate' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    const clean = R.sanitizeDebate(r.data, round1);
    assert.ok(clean, 'live debate failed sanitize');
    assert.equal(new Set(clean.lines.map((l) => l.panelist)).size, 3);
    assert.ok(clean.lines.filter((l) => l.quote).length >= 3, 'too few quoted lines');
  });

  it('live round 2 flips the vote to 3-0', { skip: !LIVE }, async () => {
    const hand1 = {
      ownership: { score: 3, quote: 'I shipped the payments revamp' },
      user_focus: { score: 0, quote: null },
      impact: { score: 3, quote: 'Checkout failures dropped 30%' },
      tradeoffs: { score: 2, quote: 'We said no to the full rewrite' }
    };
    const full = `${round1} ${round2}`;
    const skills = JSON.parse(fs.readFileSync(root('data/fallback/skills.json'), 'utf8')).skills;
    const prompt = fs.readFileSync(root('server/prompts/score.txt'), 'utf8')
      .replace('{{SKILLS}}', JSON.stringify(skills))
      .replace('{{TRANSCRIPT}}', numbered(full));
    const r = await callOpenRouter({ prompt, kind: 'score', fallbackPath: root('data/fallback/score-round2.json'), label: 'eval-rescore' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    const prev = R.verifyScores(hand1, round1);
    const next = R.verifyScores(r.data.scores, full);
    for (const dim of R.DIMENSIONS) assert.equal(next[dim].verified, true, `${dim}: ${next[dim].quote}`);
    const merged = R.ratchet(prev, next);
    assert.ok(merged.user_focus.score >= 2, `user_focus ${merged.user_focus.score}`);
    const { votes } = R.computeVotes(merged);
    assert.deepEqual(votes, { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'HIRE' });
  });

  it('live plan: weeks + projects from demo gaps', { skip: !LIVE }, async () => {
    const gaps = [{ name: 'User research', dimension: 'user_focus', status: 'missing', quote: null }];
    const prompt = fs.readFileSync(root('server/prompts/plan.txt'), 'utf8')
      .replace('{{ROLE}}', 'APM — fintech')
      .replace('{{GAPS}}', JSON.stringify(gaps));
    const r = await callOpenRouter({ prompt, kind: 'plan', fallbackPath: root('data/fallback/plan.json'), label: 'eval-plan' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    const clean = R.sanitizePlan(r.data);
    assert.ok(clean, 'live plan failed sanitize');
    assert.ok(clean.weeks.length >= 3 && clean.weeks.length <= 6);
    assert.ok(clean.projects.length >= 1);
    assert.ok(clean.weeks.every((w) => w.focus && w.tasks.length >= 1));
    assert.ok(clean.projects.every((p) => p.title && p.why));
  });

  it('live parse: voice line becomes a structured application', { skip: !LIVE }, async () => {
    const prompt = fs.readFileSync(root('server/prompts/parse.txt'), 'utf8')
      .replace('{{TEXT}}', 'Applied to Razorpay APM through a referral, they replied');
    const r = await callOpenRouter({ prompt, kind: 'parse', fallbackPath: root('data/fallback/application.json'), label: 'eval-parse' });
    assert.equal(r.usedFallback, false, `fell back: ${r.fallbackReason}`);
    assert.deepEqual(R.sanitizeApplication(r.data), { company: 'Razorpay', role: 'APM', channel: 'referral', status: 'replied' });
  });
});
