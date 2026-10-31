# Plan — Panel: an AI hiring committee that debates whether to hire you

**One line:** Ramble about your career. Three interviewers argue about you. Answer back, and watch the vote flip.
**Problem:** #05 Career pivot coach. Deadline tonight **11:59 PM IST** (planning started 3:15 PM, ~8h45m left).
**Stack:** Node + Express + vanilla JS, no build step. Deps: `express`, `dotenv`. LLM via OpenRouter REST (plain `fetch`).
**Model:** set `OPENROUTER_MODEL` in `.env`; verify the ID with `npm run check-model` in block 1 before building anything on it. (The old app silently fell back because its model ID 404'd.) Dev pick (block 3): `anthropic/claude-haiku-5.5` ($0.10/$0.50 per 1M — 10× cheaper than haiku-4.5); debate can upgrade via `OPENROUTER_DEBATE_MODEL` if lines feel flat. Live tests are gated behind `npm run test:live` so `npm test` stays free.

**Core principle (from Sentinel):** *The committee argues. The rubric decides.*
The LLM writes the debate and proposes scores with quotes. Plain code checks every quote really appears in what the user said, computes the votes, and decides HIRE / NO HIRE. The LLM never decides the vote.

> Rev 2 fixes (applied before building): (1) vote math repaired — round-1 script gains a tradeoffs line, threshold 1.8 → **1.5**, plus a red-line veto (top-weighted dimension = 0 → auto NO HIRE); (2) round 2+ scores the **concatenated transcript** with a **ratchet** (per-dimension max verified score) so the flip can't unflip; (3) no-dissenter → steelman question, multi-dissenter → closest-to-flipping asks; (4) debate/vote check is **structure + quotes only**, never tone; (5) skill statuses **derived in code** from dimension scores (dropped from `score.txt`); (6) filler strip-list = interjections only, never hedges; (7) tests are the eval harness from block 1 (`npm test`, no deps).

---

## 1. What we demo (3 min)

1. **(0:00)** Hook: "Career switchers get rejected without ever knowing why. What if you could watch the hiring committee argue about you?"
2. **(0:15)** Pick target role: **APM at a fintech** (a real JD is pre-loaded). Hit 🎙 and ramble for ~60 s via Wispr Flow, filler words and all.
3. **(0:45)** The committee appears. Three panelists debate, one line at a time, each quoting the user:
   - 👩‍💼 *Product Lead:* "'I kind of handled the launch.' 'Kind of' is doing a lot of work."
   - 👨‍💻 *Eng Manager:* "She shipped the payments revamp. That's real ownership."
   - 🧑‍🚀 *Founder:* "I heard zero about users. Not one customer."
4. **(1:20)** Votes animate in: **2 HIRE · 1 NO HIRE ❌**. The rubric table shows why (Founder: user focus 0/3, red-line veto, "no evidence").
5. **(1:35)** "What would change your mind?" The Founder asks one targeted question.
6. **(1:50)** Answer by voice (Wispr Flow).
7. **(2:10)** Re-score: user focus 0 → 2, with the new quote highlighted. **The vote flips to 3–0 HIRE ✅** ← the wow moment
8. **(2:25)** Gap map + 6-week plan + portfolio project + **share card** → "Share on LinkedIn".
9. **(2:50)** Close: "Panel. Know why before they say no." Wispr Flow screenshots.

---

## 2. Scope: every #05 requirement covered

| #05 requirement | How Panel does it | Priority |
|---|---|---|
| Resume and target-role intake | Voice ramble (main) + optional resume paste + target role + JD | Must |
| Skill-gap map from real JDs | JD → 4–6 required skills; each marked proven / partial / missing with the user's quote | Must |
| Mock interviews scored against a rubric | The committee *is* the rubric; follow-up question + re-score | Must |
| Week-by-week learning plan | Generated from the missing and partial skills, most important first | Must |
| Portfolio project suggestions matched to gaps | One project per gap (e.g. "Teardown of Zepto onboarding → user focus") | Must |
| Progress tracking that adjusts the plan | Every round is saved; a score-history strip; the plan reorders as gaps close | Must (simple) |
| Application tracker that learns | Log applications by voice; code computes reply rate by channel and role type ("referrals: 3/4 replied") | Last, keep tiny |

**Cut:** auth, multi-user, real job-board scraping (paste JDs instead), audio recording (Wispr Flow does the dictation), mobile layout polish.

---

## 3. Architecture

```
Browser (single page, 3 screens)
  Intake: role picker + JD + 🎙 ramble box (Wispr Flow dictation target)
        │ POST /api/panel
        ▼
Server (Express)
  1. extractSkills(JD)        LLM → 4–6 skills mapped to rubric dimensions   (cached per JD)
  2. score(transcript, JD)    LLM → per-dimension score 0–3 + exact quote
  3. verifyQuotes()           CODE: quote must appear in what the user said, else score = 0
  4. computeVotes()           CODE: red-line veto + weighted score ≥ 1.5 → HIRE
  5. debate(scores, quotes)   LLM → 6–8 lines that must agree with the computed votes
        │
  Follow-up: POST /api/followup  → dissenter's lowest dimension → one question (LLM)
  Answer:    POST /api/rescore   → append answer, score FULL text, ratchet per-dimension max → vote diff
  Plan:      POST /api/plan      → gap map + week-by-week plan + projects (LLM, from verified gaps only)
  Store:     data/sessions.json  (rounds, scores, applications)
```

---

## 4. Rubric (deterministic, decides the vote)

Four dimensions, each scored **0–3**:

| Dimension | 0 | 3 |
|---|---|---|
| `ownership` | Vague ("helped with", "kind of") | Clear "I decided / I shipped" with scope |
| `user_focus` | No users or customers mentioned | Talked to users, changed something because of it |
| `impact` | No numbers or outcomes | Concrete metric or outcome |
| `tradeoffs` | No choices mentioned | Explains what they said no to and why |

**Quote check (code):** every score > 0 needs a `quote`. Normalize both sides (lowercase, strip punctuation, strip filler words), and the quote must be a substring of the user's text (or ≥ 80% token overlap with one sentence). If it fails → score forced to 0, shown as "no evidence". **Filler strip-list = interjections only:** `uh, um, ah, er, hmm, "you know", "I mean"`. Never hedges (`kind of`, `sort of`) and never `like` — the debate quotes hedges as evidence.

**Panelists (fixed personas, weights sum to 1):**

| Panelist | ownership | user_focus | impact | tradeoffs |
|---|---|---|---|---|
| 👩‍💼 Product Lead | 0.3 | 0.3 | 0.2 | 0.2 |
| 👨‍💻 Eng Manager | 0.5 | 0.1 | 0.3 | 0.1 |
| 🧑‍🚀 Founder | 0.1 | 0.5 | 0.3 | 0.1 |

**Vote:** weighted score (0–3) **≥ 1.5 → HIRE**, else NO HIRE. **Red-line veto:** if a panelist's top-weighted dimension scores 0 → auto NO HIRE regardless of the weighted score (Founder's red line is `user_focus`). Demo math (asserted in tests): round 1 (o=3,u=0,i=3,t=2) → PL 1.9 HIRE, EM 2.6 HIRE, Founder vetoed → **2–1**; round 2 (u→2) → Founder 2.4 → **3–0**.

**Round 2+ (ratchet):** score the concatenated transcript (all rounds so far), verify quotes, then take the **per-dimension max** across rounds ("best evidence wins"). Skill statuses only ever upgrade.

**Follow-up target:** the NO-HIRE panelist's lowest-scoring dimension (tie → biggest weight). No dissenter → **steelman question** on the lowest dimension overall, asked by whoever weights it most. Multiple dissenters → the one **closest to flipping** (highest weighted score) asks.

**Skill status (derived in code, never LLM):** dimension 0 → `missing`, 1 → `partial`, ≥2 → `proven`, with the dimension's best verified quote (null when missing).

---

## 5. LLM calls (4 prompts, one file each in `server/prompts/`)

All return **strict JSON**. Strip ``` fences, parse, and validate. On failure → retry once → fall back to `data/fallback/*.json`, and show a visible "FALLBACK" badge.

1. **skills.txt** — input: JD text. Output: `{"skills":[{"name":"User research","dimension":"user_focus"}, ...]}` (4–6 skills).
2. **score.txt** — input: the user's text (line-numbered), the skills. Output:
   `{"scores":{"ownership":{"score":2,"quote":"I shipped the payments revamp"},...}}`
   The prompt must say: clean filler words mentally but quote the user's words exactly; never invent; score 0 with null quote if there's no evidence.
3. **debate.txt** — input: the verified scores, quotes, and **the computed votes** (code decides them before this call). Output: `{"lines":[{"panelist":"founder","text":"...","quote":"..."}],"verdicts":{"founder":"one sentence why"}}`. 6–8 lines, sharp, a little funny, never mean. Each panelist's lines must agree with their vote.
4. **plan.txt** — input: all verified skills with statuses, role. Output: `{"weeks":[{"week":1,"focus":"...","tasks":["..."]}],"projects":[{"gap":"user_focus","title":"...","why":"..."}]}`. 6 weeks max (2-week interview sprint when everything is already proven, so the plan beat never renders empty).

Follow-up question = a small prompt or a template: "{panelist}: Tell me about a time you {dimension prompt}."

---

## 6. Data model (`data/sessions.json`)

```json
{
  "sessions": [{
    "id": "s1", "role": "APM — fintech", "jdId": "jd-fintech-apm",
    "rounds": [{
      "n": 1, "input": "uh so I've been an engineer for 4 years...",
      "scores": {"ownership": {"score": 2, "quote": "...", "verified": true}},
      "votes": {"product_lead": "HIRE", "eng_manager": "HIRE", "founder": "NO_HIRE"},
      "debate": [{"panelist": "founder", "text": "...", "quote": "..."}]
    }],
    "skills": [{"name": "User research", "dimension": "user_focus", "status": "missing", "quote": null}],
    "plan": {"weeks": [], "projects": []}
  }],
  "applications": [{"company": "Razorpay", "role": "APM", "channel": "referral", "status": "replied", "date": "2026-10-31"}]
}
```

---

## 7. API

- `GET  /api/jds` → bundled JDs (2–3 real postings saved as text in `data/jds/`)
- `POST /api/panel` `{role, jdId|jdText, input}` → `{sessionId, skills, scores, votes, debate}`
- `POST /api/followup` `{sessionId}` → `{panelist, dimension, question}`
- `POST /api/rescore` `{sessionId, answer}` → `{scores, votes, debate, diff: {founder: "NO_HIRE→HIRE"}, changed: ["user_focus"]}`
- `POST /api/plan` `{sessionId}` → `{gapMap, weeks, projects}`
- `GET  /api/progress?sessionId=` → score per round (history strip)
- `POST /api/applications` `{text}` → LLM parses a voice line into `{company, role, channel, status}`; `GET /api/applications` → list + reply rate by channel (computed in code)
- `POST /api/reset` → reload the demo seed

---

## 8. UI (one page, 3 screens, built for the video)

1. **Intake:** big title, role chips (APM — fintech / PM — SaaS / Custom), a big ramble box: "🎙 Hold your Wispr Flow key and talk. Ramble, it's fine." + "Use demo answer" + **Convene the panel**. Raw transcript view shows filler words struck through.
2. **The Panel (hero screen):**
   - 3 panelist cards across the top (emoji, title, vote badge hidden until reveal).
   - The debate streams in one line at a time (~700 ms apart), like a group chat. Quotes from the user are **highlighted in yellow**. (Streaming is faked client-side from one JSON response — no SSE.)
   - Vote reveal: badges flip one by one → "2–1 HIRE" banner.
   - A rubric table under it: dimension × score, with the quote, or a red "no evidence".
   - The dissenter's question in a big card + an answer box (🎙) + **Answer the panel**.
   - **Re-score animation:** the changed score counts up, the new quote glows, the dissenter's badge flips red → green, and the banner becomes **"3–0 HIRE ✅"** with confetti.
3. **Your plan:** gap map (proven ✅ / partial 🟡 / missing ❌ with quotes), 6-week plan, project cards, score-history strip, a tiny application tracker, and the **share card**.

**Share card:** a 1200×627 DOM element → PNG via `html-to-image` from CDN (cdnjs/jsdelivr, pinned version) → Download + "Copy LinkedIn caption". It shows the role, the final vote, the funniest debate line, and "simulated committee · panel" in small print. Fallback: the card renders on screen regardless — screenshot it manually if the CDN fails.

Styling: dark, bold, big type (readable on a phone-sized video), one accent color for HIRE and one for NO HIRE.

---

## 9. Folder structure (all code in `app/`)

```
app/
  README.md                    how to run (3 commands)
  package.json                 express, dotenv; test = node --test (no test deps)
  .env.example                 OPENROUTER_KEY, OPENROUTER_MODEL, PORT
  public/index.html
  public/app.js
  public/styles.css
  server/index.js              routes
  server/llm.js                OpenRouter call + JSON parse + retry + fallback
  server/rubric.js             quote check, veto, weights, votes, follow-up target (no LLM)
  server/store.js              sessions.json read/write
  server/check-model.js        verifies OPENROUTER_MODEL against /api/v1/models (npm run check-model)
  server/prompts/skills.txt
  server/prompts/score.txt
  server/prompts/debate.txt
  server/prompts/plan.txt
  data/seed.json               empty sessions + sample applications
  data/jds/fintech-apm.txt     real JD text (copy from a real posting)
  data/jds/saas-pm.txt
  data/demo/round1.txt         the scripted ramble (flips at round 2)
  data/demo/round2.txt         the scripted follow-up answer
  data/fallback/*.json         canned outputs for the demo inputs
  data/sessions.json           runtime store (created on first run)
  test/rubric.test.js          evals: quote check, votes 2–1 → 3–0, targets, skills
  test/eval-live.test.js       block 3: live scores must land near hand-written ones (needs key)
```

---

## 10. Build order (timeboxed)

| # | Block | Clock (IST) | Done when |
|---|---|---|---|
| 1 | Scaffold + model check + JDs + demo script | 3:30 – 4:00 | Server runs, `npm run check-model` confirms the ID (or picks a live one), 2 JDs + both demo answers saved |
| 2 | `rubric.js` + eval tests on the demo text | 4:00 – 4:45 | `npm test` green: quote check rejects a made-up quote; hand-written round 1 = 2–1 (PL 1.9 / EM 2.6 / Founder veto), round 2 ratchet = 3–0 |
| 3 | score + skills prompts → live scores | 4:45 – 5:45 | Live call on round 1 gives scores close to the hand-written ones (`test/eval-live.test.js`); fallback works with the key removed |
| 4 | Debate prompt + Panel screen with streaming + vote reveal | 5:45 – 7:15 | Debate lines quote the user, agree with the votes, reveal animates |
| 5 | Follow-up + re-score + **vote-flip animation** | 7:15 – 8:15 | Live: answer by voice → dissenter flips → 3–0 banner |
| 6 | Plan screen: gap map, weeks, projects, progress strip | 8:15 – 9:00 | Plan only uses verified gaps |
| 7 | Share card + application tracker (tiny) | 9:00 – 9:30 | PNG downloads; 3 voice-logged applications show reply rate by channel |
| 8 | Polish + fallback drill + rehearse | 9:30 – 10:00 | Full demo works twice in a row, once with the key removed |
| 9 | Video + Wispr screenshots + LinkedIn post + submit | **10:00 – 11:30** | Submitted with 30 min of buffer |

**Hard cut rule:** if block 5 isn't done by **8:30 PM**, skip the application tracker and shrink the plan screen to the gap map + projects. The vote flip is the product; protect it.

---

## 11. Demo script (must contain)

**Round 1 ramble** (rehearse it so it reliably scores 2–1):
- Filler and a self-correction: "uh so I've been a backend engineer for, like, three — no, four years"
- Strong ownership: "I shipped the payments revamp, I owned it end to end"
- Weak phrase to quote: "I kind of handled the launch"
- A metric: "checkout failures dropped 30%"
- Tradeoffs line (required for the math): "we said no to the full rewrite and shipped the risky patch instead"
- **Zero mention of users or customers** → Founder red-line vetoes on user focus

**Round 2 answer** (to the Founder's question):
- "I sat with five merchants during onboarding, saw they kept abandoning the KYC step, and we cut it from four screens to two, and completion went up."

---

## 12. Submission checklist

- [ ] 3-min video (script in §1)
- [ ] Wispr Flow screenshots: dictating prompts to the AI builder + dictating the ramble and the answer in the app (start capturing in block 1)
- [ ] LinkedIn AI Building Streak posts tagging Product Space (post your own share card)
- [ ] Deploy to a public URL if time allows, so other participants can try it (count real users for the video)
- [ ] Submit: https://theproductspace.in/user-dashboard/submissions/agentic-ai-hackathons

---

## 13. Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Vote doesn't flip in the live demo | Votes computed by code from verified scores; veto guarantees round-1 dissent; ratchet protects round 2; threshold tuned on the demo script; fallback JSON for both rounds |
| LLM invents quotes | Quote check in code forces score 0; UI shows "no evidence" |
| Debate contradicts the votes | Votes + verdicts passed into the debate prompt; code verifies structure (6–8 lines, all panelists speak) and quote validity — tone is not checked |
| Model ID 404 / API down | Check model list first in block 1; `llm.js` retries once, logs loudly, shows a visible "FALLBACK" badge |
| Live scores drift from hand-written ones | `test/eval-live.test.js` measures the gap in block 3; prompt tuning until user_focus=0 and ownership/impact≥2 on round 1 |
| Panelists sound mean or generic | Prompt: sharp, specific, quote the user, never insult; bigger model for the debate if the small one is flat |
| Looks like a real company's opinion | "Simulated committee" label on screen and on the share card; generic company names |
| Scope creep | §2 cut list is final; tracker is last and tiny |
