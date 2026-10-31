// Pure rules: the committee argues, the rubric decides. No LLM here.

const DIMENSIONS = ['ownership', 'user_focus', 'impact', 'tradeoffs'];
const PANELISTS = ['product_lead', 'eng_manager', 'founder'];
const WEIGHTS = {
  product_lead: { ownership: 0.3, user_focus: 0.3, impact: 0.2, tradeoffs: 0.2 },
  eng_manager: { ownership: 0.5, user_focus: 0.1, impact: 0.3, tradeoffs: 0.1 },
  founder: { ownership: 0.1, user_focus: 0.5, impact: 0.3, tradeoffs: 0.1 }
};
const THRESHOLD = 1.5;
// Standalone interjections only. Never hedges ("kind of") or "like".
const FILLER_WORDS = ['uh', 'um', 'ah', 'er', 'hmm'];
const FILLER_PHRASES = ['you know', 'i mean'];

function normalize(text) {
  let s = ` ${String(text || '').toLowerCase()} `;
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  for (const p of FILLER_PHRASES) s = s.split(` ${p} `).join(' ');
  return s.split(/\s+/).filter((w) => w && !FILLER_WORDS.includes(w)).join(' ');
}

function sentences(text) {
  return String(text || '').split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function tokenOverlap(a, b) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = b.split(' ').filter(Boolean);
  if (!A.size || !B.length) return 0;
  const hit = B.filter((w) => A.has(w)).length;
  return hit / Math.max(A.size, B.length);
}

function quoteCheck(quote, userText) {
  const q = normalize(quote);
  if (!q) return false;
  if (normalize(userText).includes(q)) return true;
  return sentences(userText).some((s) => tokenOverlap(normalize(s), q) >= 0.8);
}

function verifyScores(scores, userText) {
  const out = {};
  for (const dim of DIMENSIONS) {
    const entry = (scores || {})[dim] || { score: 0, quote: null };
    const score = Number(entry.score) || 0;
    if (score > 0 && quoteCheck(entry.quote, userText)) {
      out[dim] = { score, quote: entry.quote, verified: true };
    } else if (score > 0) {
      out[dim] = { score: 0, quote: entry.quote || null, verified: false, note: 'no evidence' };
    } else {
      out[dim] = { score: 0, quote: null, verified: true };
    }
  }
  return out;
}

function weightedScore(panelist, verifiedScores) {
  const w = WEIGHTS[panelist];
  return DIMENSIONS.reduce((sum, dim) => sum + w[dim] * (verifiedScores[dim].score || 0), 0);
}

function topDimension(panelist) {
  return DIMENSIONS.reduce((a, b) => (WEIGHTS[panelist][b] > WEIGHTS[panelist][a] ? b : a));
}

function computeVotes(verifiedScores) {
  const votes = {};
  const detail = {};
  for (const panelist of Object.keys(WEIGHTS)) {
    const weighted = weightedScore(panelist, verifiedScores);
    const vetoed = (verifiedScores[topDimension(panelist)].score || 0) === 0;
    votes[panelist] = !vetoed && weighted >= THRESHOLD ? 'HIRE' : 'NO_HIRE';
    detail[panelist] = { weighted: Math.round(weighted * 100) / 100, vetoed };
  }
  return { votes, detail };
}

function lowestDimension(panelist, verifiedScores) {
  return [...DIMENSIONS].sort((a, b) => {
    const sa = verifiedScores[a].score || 0;
    const sb = verifiedScores[b].score || 0;
    if (sa !== sb) return sa - sb;
    return WEIGHTS[panelist][b] - WEIGHTS[panelist][a];
  })[0];
}

function followupTarget(votes, verifiedScores, detail) {
  const dissenters = Object.keys(votes).filter((p) => votes[p] === 'NO_HIRE');
  if (!dissenters.length) {
    const dim = [...DIMENSIONS].sort((a, b) => (verifiedScores[a].score || 0) - (verifiedScores[b].score || 0))[0];
    const panelist = Object.keys(WEIGHTS).sort((a, b) => WEIGHTS[b][dim] - WEIGHTS[a][dim])[0];
    return { panelist, dimension: dim, steelman: true };
  }
  const panelist = dissenters.sort((a, b) => detail[b].weighted - detail[a].weighted)[0];
  return { panelist, dimension: lowestDimension(panelist, verifiedScores), steelman: false };
}

function sanitizeDebate(data, userText) {
  if (!data || !Array.isArray(data.lines)) return null;
  const lines = data.lines
    .filter((l) => l && PANELISTS.includes(l.panelist) && typeof l.text === 'string' && l.text.trim())
    .slice(0, 10)
    .map((l) => ({
      panelist: l.panelist,
      text: l.text.trim().slice(0, 500),
      quote: typeof l.quote === 'string' && l.quote && quoteCheck(l.quote, userText) ? l.quote : null
    }));
  if (lines.length < 4) return null;
  if (new Set(lines.map((l) => l.panelist)).size < 3) return null;
  const verdicts = data.verdicts && typeof data.verdicts === 'object' ? data.verdicts : {};
  return { lines, verdicts };
}

function skillStatus(dimensionScore) {
  if (dimensionScore >= 2) return 'proven';
  if (dimensionScore === 1) return 'partial';
  return 'missing';
}

function deriveSkills(skills, verifiedScores) {
  return (skills || []).map((s) => {
    const dim = verifiedScores[s.dimension] || { score: 0, quote: null };
    return {
      name: s.name,
      dimension: s.dimension,
      status: skillStatus(dim.score),
      quote: dim.score > 0 ? dim.quote : null
    };
  });
}

const STATUS_RANK = { missing: 0, partial: 1, proven: 2 };

function mergeSkills(prev, next) {
  const byName = Object.fromEntries((prev || []).map((s) => [s.name, s]));
  for (const s of next || []) {
    const old = byName[s.name];
    if (!old || STATUS_RANK[s.status] > STATUS_RANK[old.status]) byName[s.name] = s;
  }
  return Object.values(byName);
}

function ratchet(prevVerified, nextVerified) {
  const out = {};
  for (const dim of DIMENSIONS) {
    const a = prevVerified[dim] || { score: 0 };
    const b = nextVerified[dim] || { score: 0 };
    out[dim] = (b.score || 0) >= (a.score || 0) ? b : a;
  }
  return out;
}

function diffVotes(oldVotes, newVotes) {
  const diff = {};
  for (const p of PANELISTS) {
    if (oldVotes[p] !== newVotes[p]) diff[p] = `${oldVotes[p]}→${newVotes[p]}`;
  }
  return diff;
}

function changedDims(prevVerified, nextVerified) {
  return DIMENSIONS.filter((dim) => (prevVerified[dim].score || 0) !== (nextVerified[dim].score || 0));
}

function sanitizePlan(data) {
  if (!data || !Array.isArray(data.weeks) || !Array.isArray(data.projects)) return null;
  const weeks = data.weeks
    .filter((w) => w && typeof w.focus === 'string' && w.focus.trim())
    .slice(0, 6)
    .map((w, i) => ({
      week: Number.isInteger(w.week) ? w.week : i + 1,
      focus: w.focus.trim().slice(0, 200),
      tasks: Array.isArray(w.tasks) ? w.tasks.filter((t) => typeof t === 'string').slice(0, 5).map((t) => t.trim().slice(0, 200)) : []
    }));
  const projects = data.projects
    .filter((p) => p && typeof p.title === 'string' && p.title.trim())
    .slice(0, 6)
    .map((p) => ({
      gap: typeof p.gap === 'string' ? p.gap : 'general',
      title: p.title.trim().slice(0, 120),
      why: typeof p.why === 'string' ? p.why.trim().slice(0, 300) : ''
    }));
  if (!weeks.length || !projects.length) return null;
  return { weeks, projects };
}

module.exports = {
  DIMENSIONS, PANELISTS, WEIGHTS, THRESHOLD,
  normalize, quoteCheck, verifyScores,
  weightedScore, computeVotes, followupTarget, sanitizeDebate,
  skillStatus, deriveSkills, mergeSkills, ratchet,
  diffVotes, changedDims, sanitizePlan
};

const CHANNELS = ['referral', 'job-board', 'recruiter', 'cold-email', 'careers-page', 'other'];
const STATUSES = ['applied', 'replied', 'interviewing', 'ghosted', 'rejected', 'offer'];
const REPLIED = new Set(['replied', 'interviewing', 'offer']);

function sanitizeApplication(data) {
  if (!data || typeof data.company !== 'string' || !data.company.trim()) return null;
  if (typeof data.role !== 'string' || !data.role.trim()) return null;
  return {
    company: data.company.trim().slice(0, 80),
    role: data.role.trim().slice(0, 80),
    channel: CHANNELS.includes(data.channel) ? data.channel : 'other',
    status: STATUSES.includes(data.status) ? data.status : 'applied'
  };
}

function replyRates(applications) {
  const rates = {};
  for (const a of applications || []) {
    const ch = a.channel || 'other';
    rates[ch] = rates[ch] || { replied: 0, total: 0 };
    rates[ch].total += 1;
    if (REPLIED.has(a.status)) rates[ch].replied += 1;
  }
  return rates;
}

module.exports.sanitizeApplication = sanitizeApplication;
module.exports.replyRates = replyRates;
