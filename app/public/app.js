const $ = (id) => document.getElementById(id);
const PEOPLE = {
  product_lead: { emoji: '👩‍💼', name: 'Product Lead' },
  eng_manager: { emoji: '👨‍💻', name: 'Eng Manager' },
  founder: { emoji: '🧑‍🚀', name: 'Founder' }
};
const ORDER = ['product_lead', 'eng_manager', 'founder'];
const DIM_LABEL = { ownership: 'Ownership', user_focus: 'User focus', impact: 'Impact', tradeoffs: 'Tradeoffs' };
const DIM_SHORT = { ownership: 'own', user_focus: 'usr', impact: 'imp', tradeoffs: 'trd' };
let role = 'APM — fintech';
let sessionId = null;
let allLines = [];
let firstVotes = null;
let finalVotes = null;
let mode = 'agent'; // 'agent' = the panel runs the interview; 'pipeline' = fixed fallback flow
let round = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOOL_ICON = { score_evidence: '📏', cast_votes: '🗳️', ask_candidate: '❓', finish_interview: '🏁' };
// Live panel lines and vote changes play in order, spaced out so they read like a chat.
let liveQueue = Promise.resolve();
const enqueue = (fn) => { liveQueue = liveQueue.then(fn).catch((e) => console.error('live queue:', e)); return liveQueue; };

function onAgentEvent(event) {
  if (event.type === 'line') {
    enqueue(async () => {
      appendLine(event);
      await sleep(event.ask ? 300 : 900);
    });
    return;
  }
  addTrace(event);
  if (event.tool === 'cast_votes' && event.votes) {
    enqueue(async () => {
      for (const p of ORDER) {
        if (setBadge(p, event.votes[p])) await sleep(350);
      }
      renderBanner(event.votes, false);
    });
  }
}

// POST that reads an NDJSON stream; onEvent gets every progress line, the result/error line is returned.
async function streamPost(url, body, onEvent) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    return { type: 'error', fallback: true, error: err.error || `HTTP ${res.status}` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result = { type: 'error', fallback: true, error: 'stream ended without a result' };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'result' || event.type === 'error') result = event;
        else onEvent(event);
      }
    }
  } catch (e) {
    return { type: 'error', fallback: true, error: `stream broke: ${e.message}` };
  }
  return result;
}

function addTrace(event) {
  const row = document.createElement('div');
  if (event.type === 'think') {
    row.className = 'tr think';
    row.innerHTML = `<span class="ic">💭</span><span>${esc(event.text)}</span>`;
  } else if (event.type === 'tool') {
    row.className = `tr${event.ok === false ? ' bad' : ''}${event.tool === 'ask_candidate' ? ' ask' : ''}`;
    const who = event.panelist ? `${PEOPLE[event.panelist].emoji} ` : '';
    row.innerHTML = `<span class="ic">${TOOL_ICON[event.tool] || '🔧'}</span><span><code>${esc(event.tool)}</code> ${who}${esc(event.text)}${event.why ? ` <span class="why">— ${esc(event.why)}</span>` : ''}</span>`;
  } else {
    row.className = 'tr';
    row.innerHTML = `<span class="ic">📄</span><span>${esc(event.text)}</span>`;
  }
  $('trace').appendChild(row);
  $('trace').parentElement.scrollTop = $('trace').parentElement.scrollHeight;
}

function traceStatus(text, working) {
  $('trace-status').textContent = text;
  $('trace-status').classList.toggle('working', Boolean(working));
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function withQuote(text, quote) {
  if (!quote) return esc(text);
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + quote.length)) + '</mark>' + esc(text.slice(i + quote.length));
}

function setStatus(text) {
  $('status').textContent = text;
}

function voteCount(votes) {
  const hires = ORDER.filter((p) => votes[p] === 'HIRE').length;
  return `${hires}–${3 - hires} ${hires >= 2 ? 'HIRE ✅' : 'NO HIRE ❌'}`;
}

function confetti() {
  const colors = ['#22c55e', '#fde047', '#22d3ee', '#f472b6', '#ffffff'];
  for (let i = 0; i < 80; i++) {
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = `${Math.random() * 100}vw`;
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = `${Math.random() * 0.5}s`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
}

function showOnly(id) {
  for (const s of ['screen-intake', 'screen-panel', 'screen-plan']) $(s).classList.toggle('hidden', s !== id);
}

const ROLE_JD = { 'APM — fintech': 'fintech-apm', 'PM — SaaS': 'saas-pm' };
document.querySelectorAll('#roles .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#roles .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
    role = chip.dataset.role;
    if (ROLE_JD[role] && [...$('jd').options].some((o) => o.value === ROLE_JD[role])) $('jd').value = ROLE_JD[role];
  });
});

async function loadJds() {
  const data = await (await fetch('/api/jds')).json();
  $('jd').innerHTML = data.jds.map((j) => `<option value="${esc(j.id)}">${esc(j.name)}</option>`).join('');
  if (ROLE_JD[role]) $('jd').value = ROLE_JD[role];
}

$('btn-demo').addEventListener('click', async () => {
  $('ramble').value = await (await fetch('/api/demo/1')).text();
  setStatus('Demo answer loaded. Hit "Convene the panel".');
});

$('btn-demo2').addEventListener('click', async () => {
  $('answer').value = await (await fetch('/api/demo/2')).text();
});

async function startOver() {
  await fetch('/api/reset', { method: 'POST' });
  sessionId = null;
  allLines = [];
  firstVotes = null;
  finalVotes = null;
  mode = 'agent';
  round = 1;
  liveQueue = Promise.resolve();
  reportOpen = false;
  showOnly('screen-intake');
  $('trace').innerHTML = '';
  traceStatus('', false);
  $('finish').classList.add('hidden');
  $('chat').innerHTML = '';
  $('panelists').innerHTML = '';
  $('banner').classList.add('hidden');
  $('followup').classList.add('hidden');
  $('answer').value = '';
  document.querySelector('#rubric tbody').innerHTML = '';
  setStatus('');
}

$('btn-startover').addEventListener('click', startOver);
$('btn-startover2').addEventListener('click', startOver);
$('btn-back').addEventListener('click', () => showOnly('screen-panel'));

$('btn-convene').addEventListener('click', async () => {
  const input = $('ramble').value.trim();
  if (!input) {
    setStatus('Say something first — even a ramble.');
    return;
  }
  setStatus('');
  $('btn-convene').disabled = true;
  showOnly('screen-panel');
  $('chat').innerHTML = '';
  $('trace').innerHTML = '';
  $('banner').classList.add('hidden');
  $('finish').classList.add('hidden');
  $('followup').classList.add('hidden');
  document.querySelector('#rubric tbody').innerHTML = '';
  renderPanelists();
  traceStatus('interviewing', true);
  const body = { role, jdId: $('jd').value, input, docs: $('docs').value.trim() };
  let d = await streamPost('/api/interview/start', body, onAgentEvent);
  await liveQueue;
  if (d.type === 'error') {
    // The agent could not run (no key, API down, no tool support): fixed pipeline instead.
    mode = 'pipeline';
    addTrace({ type: 'tool', tool: 'fallback', ok: false, text: `agent unavailable (${d.error}) → scripted panel` });
    d = await (await fetch('/api/panel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  }
  $('btn-convene').disabled = false;
  traceStatus('', false);
  if (!d.ok) {
    showOnly('screen-intake');
    setStatus(`Error: ${d.error}`);
    return;
  }
  sessionId = d.sessionId;
  allLines = d.debate.lines.filter((l) => !l.ask);
  firstVotes = d.votes;
  finalVotes = d.votes;
  if (mode === 'agent') {
    await showAgentTurn(d);
    afterAgentTurn(d);
  } else {
    await showPanel(d);
    await showFollowup();
  }
});

// Agent mode: lines and votes already played live; settle badges, banner and rubric.
async function showAgentTurn(d) {
  const fb = d.usedFallback && d.usedFallback.debate;
  $('fallback-badge').classList.toggle('hidden', !fb);
  if (!d.debateLive) await streamLines(d.debate.lines, 700);
  for (const p of ORDER) {
    if (setBadge(p, d.votes[p])) await sleep(400);
  }
  renderBanner(d.votes, d.status !== 'asking');
  renderRubric(d.scores);
}

function renderPanelists() {
  $('panelists').innerHTML = ORDER.map((p) => `
    <div class="card" data-p="${p}">
      <div class="avatar">${PEOPLE[p].emoji}</div>
      <div>${PEOPLE[p].name}</div>
      <div class="badge" data-badge>?</div>
    </div>`).join('');
}

// After the agent pauses or finishes: show its question, or why it stopped.
function afterAgentTurn(d) {
  if (d.status === 'asking' && d.question) {
    // The question is already in the chat; the box only takes the answer.
    renderQuestion({ panelistName: d.question.panelistName, question: d.question.question, why: d.question.why, inline: true });
    traceStatus(`waiting for your answer · ${d.questionsLeft} question${d.questionsLeft === 1 ? '' : 's'} left`, false);
  } else {
    $('followup').classList.add('hidden');
    $('finish').textContent = `🏁 Interview closed: ${d.finishReason || 'the panel has decided'} — writing your report…`;
    $('finish').classList.remove('hidden');
    traceStatus('done', false);
    setTimeout(openReport, 2500);
  }
}

function renderQuestion(q) {
  $('q-from').textContent = q.inline
    ? `🎙 ${q.panelistName} interrupted. Answer by voice:`
    : q.steelman ? `Steelman question — ${q.panelistName} asks:` : `${q.panelistName} asks:`;
  $('q-text').textContent = q.question;
  $('q-text').classList.toggle('hidden', Boolean(q.inline));
  $('q-why').textContent = q.why ? `Why: ${q.why}` : '';
  $('answer').value = '';
  $('followup').classList.remove('hidden');
  $('followup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function appendLine(line) {
  const div = document.createElement('div');
  if (line.panelist === 'you') {
    div.className = 'chatline you';
    div.innerHTML = `<div class="who">🎙</div><div><b>You</b><br/>${esc(line.text)}</div>`;
  } else {
    div.className = `chatline${line.ask ? ' ask' : ''}`;
    const label = line.ask ? `${PEOPLE[line.panelist].name} <span class="pill">interrupts you</span>` : PEOPLE[line.panelist].name;
    div.innerHTML = `<div class="who">${PEOPLE[line.panelist].emoji}</div><div><b>${label}</b><br/>${withQuote(line.text, line.quote)}</div>`;
  }
  $('chat').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function streamLines(lines, gapMs) {
  for (const line of lines) {
    await sleep(gapMs);
    appendLine(line);
  }
}

// Only a finished interview gets a verdict; until then the banner shows where the vote stands.
function renderBanner(votes, final) {
  const hires = ORDER.filter((p) => votes[p] === 'HIRE').length;
  $('banner').textContent = final ? voteCount(votes) : `Vote so far: ${hires}–${3 - hires} · not final until the panel finishes`;
  $('banner').classList.toggle('provisional', !final);
  $('banner').classList.remove('hidden');
}

function renderRubric(scores) {
  document.querySelector('#rubric tbody').innerHTML = Object.keys(DIM_LABEL).map((dim) => {
    const s = scores[dim];
    const dots = '●'.repeat(s.score) + '○'.repeat(3 - s.score);
    const ev = s.score > 0 && s.quote ? `“${esc(s.quote)}”` : '<span class="noev">no evidence</span>';
    return `<tr data-dim="${dim}"><td>${DIM_LABEL[dim]}</td><td data-score>${dots} ${s.score}/3</td><td data-ev>${ev}</td></tr>`;
  }).join('');
}

async function showPanel(d) {
  showOnly('screen-panel');
  const fb = d.usedFallback && (d.usedFallback.skills || d.usedFallback.score || d.usedFallback.debate);
  $('fallback-badge').classList.toggle('hidden', !fb);
  $('chat').innerHTML = '';
  $('banner').classList.add('hidden');
  $('followup').classList.add('hidden');
  document.querySelector('#rubric tbody').innerHTML = '';
  renderPanelists();

  await streamLines(d.debate.lines, 700);

  for (const p of ORDER) {
    await sleep(500);
    setBadge(p, d.votes[p]);
  }
  renderBanner(d.votes, false); // a follow-up question always comes next
  renderRubric(d.scores);
}

// Returns true when the badge actually changed.
function setBadge(p, vote) {
  const badge = document.querySelector(`[data-p="${p}"] [data-badge]`);
  if (!badge || badge.dataset.vote === vote) return false;
  badge.dataset.vote = vote;
  const hire = vote === 'HIRE';
  badge.textContent = hire ? 'HIRE' : 'NO HIRE';
  badge.classList.remove('hire', 'nohire', 'pop');
  void badge.offsetWidth;
  badge.classList.add(hire ? 'hire' : 'nohire', 'pop');
  return true;
}

async function showFollowup() {
  const res = await fetch('/api/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  const f = await res.json();
  if (!f.ok) return;
  renderQuestion({ ...f, question: f.question.replace(/^[^:]+:\s*/, '') });
}

$('btn-answer').addEventListener('click', async () => {
  const answer = $('answer').value.trim();
  if (!answer) return;
  $('btn-answer').disabled = true;
  $('btn-answer').textContent = 'The panel is listening…';
  let r;
  if (mode === 'agent') {
    traceStatus('thinking', true);
    $('followup').classList.add('hidden');
    appendLine({ panelist: 'you', text: answer });
    r = await streamPost('/api/interview/answer', { sessionId, answer }, onAgentEvent);
    await liveQueue;
    if (r.type === 'error') {
      mode = 'pipeline';
      addTrace({ type: 'tool', tool: 'fallback', ok: false, text: `agent unavailable (${r.error}) → scripted re-score` });
    }
  }
  if (mode === 'pipeline') {
    r = await (await fetch('/api/rescore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answer })
    })).json();
  }
  $('btn-answer').disabled = false;
  $('btn-answer').textContent = 'Answer the panel';
  traceStatus('', false);
  if (!r.ok) return;
  $('followup').classList.add('hidden');
  allLines = [...allLines, ...r.debate.lines.filter((l) => !l.ask)];
  finalVotes = r.votes;
  round += 1;
  await animateRescore(r, mode === 'agent' && r.debateLive);
  if (mode === 'agent') afterAgentTurn(r);
});

async function countUp(dim, from, to) {
  const cell = document.querySelector(`tr[data-dim="${dim}"] [data-score]`);
  for (let v = from; v <= to; v++) {
    cell.textContent = `${'●'.repeat(v)}${'○'.repeat(3 - v)} ${v}/3`;
    await sleep(300);
  }
}

// live = the debate lines already played as they streamed in.
async function animateRescore(r, live) {
  for (const dim of r.changed) {
    const row = document.querySelector(`tr[data-dim="${dim}"]`);
    const from = parseInt(row.querySelector('[data-score]').textContent.match(/(\d)\/3/)[1], 10);
    await countUp(dim, from, r.scores[dim].score);
    const ev = row.querySelector('[data-ev]');
    ev.innerHTML = `“${esc(r.scores[dim].quote)}”`;
    ev.classList.add('glow');
  }
  for (const p of Object.keys(r.diff)) {
    await sleep(400);
    setBadge(p, r.votes[p]);
  }
  // Pipeline mode has one question, so its re-score is final; the agent may ask again.
  renderBanner(r.votes, mode !== 'agent' || r.status !== 'asking');
  if (!live) {
    const div = document.createElement('div');
    div.className = 'divider';
    div.textContent = `Round ${round} — after your answer`;
    $('chat').appendChild(div);
    await streamLines(r.debate.lines, 500);
  }
  if (Object.keys(r.diff).length && ORDER.every((p) => r.votes[p] === 'HIRE')) confetti();
}

const STATUS_PILL = { proven: '✅ proven', partial: '🟡 partial', missing: '❌ missing' };

function pickLine() {
  const quoted = allLines.filter((l) => l.quote);
  const pool = quoted.length ? quoted : allLines;
  return pool.reduce((a, b) => (b.text.length > a.text.length ? b : a), { text: '', panelist: 'founder' });
}

function renderShare() {
  const line = pickLine();
  $('share-role').textContent = role;
  $('share-vote').textContent = voteCount(finalVotes || firstVotes || { product_lead: 'HIRE', eng_manager: 'HIRE', founder: 'HIRE' });
  $('share-line').textContent = `“${line.text}” — ${PEOPLE[line.panelist].name}`;
}

function captionText() {
  if (!firstVotes || !finalVotes) return 'I faced a simulated hiring committee. Know why before they say no. #AIBuildingStreak';
  const arc = JSON.stringify(firstVotes) !== JSON.stringify(finalVotes)
    ? `First vote: ${voteCount(firstVotes)}. I answered the dissenter's question — and flipped it to ${voteCount(finalVotes)}.`
    : `Final vote: ${voteCount(finalVotes)}.`;
  return `I put my ${role} pivot in front of a simulated hiring committee. ${arc}\n\nKnow why before they say no. #AIBuildingStreak`;
}

$('btn-png').addEventListener('click', async () => {
  if (!window.htmlToImage) {
    alert('Image library failed to load — screenshot the card instead.');
    return;
  }
  try {
    const url = await window.htmlToImage.toPng($('share-card'), { pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'panel-share.png';
    a.click();
  } catch (e) {
    alert('PNG export failed — screenshot the card instead.');
  }
});

$('btn-caption').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(captionText());
    $('btn-caption').textContent = 'Copied ✓';
    setTimeout(() => { $('btn-caption').textContent = 'Copy LinkedIn caption'; }, 2000);
  } catch (e) {
    prompt('Copy your caption:', captionText());
  }
});

async function loadApps() {
  const d = await (await fetch('/api/applications')).json();
  $('app-rates').innerHTML = Object.entries(d.rates).map(([ch, r]) =>
    `<span class="pill">${esc(ch)}: ${r.replied}/${r.total} replied</span>`
  ).join(' ') || '<p class="dim">No applications yet.</p>';
  $('app-list').innerHTML = d.applications.map((a) =>
    `<div class="app-row"><b>${esc(a.company)}</b> — ${esc(a.role)} <span class="ev">${esc(a.channel)}</span> <span class="ev">${esc(a.status)}</span></div>`
  ).join('');
}

$('btn-logapp').addEventListener('click', async () => {
  const text = $('app-log').value.trim();
  if (!text) return;
  $('btn-logapp').disabled = true;
  const res = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const d = await res.json();
  $('btn-logapp').disabled = false;
  if (!d.ok) return;
  $('app-log').value = '';
  loadApps();
});

let reportOpen = false;

function renderReportHead(plan) {
  $('report-verdict').textContent = `Final vote: ${voteCount(plan.votes)}`;
  $('report-verdict').classList.remove('hidden');
  $('report-panel').innerHTML = ORDER.map((p) => {
    const hire = plan.votes[p] === 'HIRE';
    const d = plan.detail[p];
    return `
    <div class="card">
      <div class="avatar">${PEOPLE[p].emoji}</div>
      <div>${PEOPLE[p].name}</div>
      <div class="badge ${hire ? 'hire' : 'nohire'}">${hire ? 'HIRE' : 'NO HIRE'}</div>
      <div class="dim">${d.weighted}/3 weighted${d.vetoed ? ' · red-line veto' : ''}</div>
    </div>`;
  }).join('');
  $('report-qa').innerHTML = (plan.qa || []).map((q) => `
    <div class="week">
      <div><b>${PEOPLE[q.panelist] ? `${PEOPLE[q.panelist].emoji} ${PEOPLE[q.panelist].name}` : 'Panel'}:</b> ${esc(q.question)}</div>
      <div class="dim">${q.answer ? `🎙 “${esc(q.answer)}”` : 'not answered'}</div>
    </div>`).join('') || '<p class="dim">The panel had no questions. Your story spoke for itself.</p>';
}

async function openReport() {
  if (reportOpen || !sessionId) return;
  reportOpen = true;
  showOnly('screen-plan');
  $('plan-status').textContent = 'Building your report…';
  $('report-verdict').classList.add('hidden');
  $('report-panel').innerHTML = '';
  $('report-qa').innerHTML = '';
  $('gaps').innerHTML = '';
  $('weeks').innerHTML = '';
  $('projects').innerHTML = '';
  $('progress').innerHTML = '';
  const [plan, progress] = await Promise.all([
    (await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })).json(),
    (await fetch(`/api/progress?sessionId=${encodeURIComponent(sessionId)}`)).json()
  ]);
  reportOpen = false;
  if (!plan.ok) {
    $('plan-status').textContent = `Error: ${plan.error}`;
    return;
  }
  $('fallback-badge').classList.toggle('hidden', !plan.usedFallback);
  $('plan-status').textContent = 'Everything below comes from your verified answers — gaps most important first.';
  renderReportHead(plan);
  $('gaps').innerHTML = plan.gapMap.map((g) => `
    <div class="gap ${g.status}">
      <div><b>${esc(g.name)}</b> <span class="pill">${STATUS_PILL[g.status]}</span></div>
      <div class="dim">${g.quote ? `“${esc(g.quote)}”` : 'no evidence yet'}</div>
    </div>`).join('');
  $('weeks').innerHTML = plan.weeks.map((w) => `
    <div class="week">
      <div><b>Week ${w.week}:</b> ${esc(w.focus)}</div>
      <ul>${w.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`).join('') || '<p class="dim">Nothing scheduled.</p>';
  $('projects').innerHTML = plan.projects.map((p) => `
    <div class="project">
      <div><b>${esc(p.title)}</b> <span class="ev">${esc(p.gap)}</span></div>
      <div class="dim">${esc(p.why)}</div>
    </div>`).join('') || '<p class="dim">No projects.</p>';
  if (progress.ok) {
    $('progress').innerHTML = progress.rounds.map((r) => {
      const hires = ORDER.filter((p) => r.votes[p] === 'HIRE').length;
      const bars = Object.keys(DIM_LABEL).map((dim) => `
        <div class="bar-row"><span>${DIM_SHORT[dim]}</span><div class="bar"><i style="width:${(r.scores[dim] / 3) * 100}%"></i></div><b>${r.scores[dim]}</b></div>`).join('');
      return `<div class="round"><b>Round ${r.n}</b> → ${hires}–${3 - hires} ${hires >= 2 ? 'HIRE ✅' : 'NO HIRE ❌'}${bars}</div>`;
    }).join('');
  }
  renderShare();
  loadApps();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('btn-plan').addEventListener('click', openReport);

loadJds();
