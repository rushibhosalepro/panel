# Panel — an AI hiring committee that debates whether to hire you

**Ramble about your career. Three interviewers argue about you live, stop to ask you questions, and vote. Answer back by voice, and watch the vote flip.**

🎥 **Demo video:** https://www.youtube.com/watch?v=H-J7F2KsisM

Built for the **Agentic AI Hackathon '26 — Product Space × Wispr Flow**, problem statement **#05: Career pivot coach**.

---

## The problem

Career switchers get rejected without ever knowing why. A rejection email says "we went with other candidates", not "you never once mentioned a user". Generic AI interview coaches give generic feedback and can't tell you which sentence cost you the job.

## What Panel does

1. **Intake.** Pick a target role and a real job description. Hold your Wispr Flow key and ramble about your career, filler words and all. Optionally paste your resume or cover letter.
2. **Live debate.** Three panelists (👩‍💼 Product Lead, 👨‍💻 Eng Manager, 🧑‍🚀 Founder) score you against a rubric and argue about you in a group chat, quoting your exact words.
3. **Interruptions.** When a panelist has a doubt you could clear up, they cut into the debate and ask you one specific question. You answer by voice. The panel re-scores, reacts, and may ask again (up to 3 questions).
4. **The vote.** Each panelist votes HIRE or NO HIRE. While the interview is running the banner says *"vote so far"*; the verdict is only final when the panel finishes.
5. **The report.** Final vote, each panelist's weighted score and veto, every question with your answer, a skill-gap map built from the job description, a week-by-week plan, portfolio projects matched to each gap, a progress strip across rounds, a LinkedIn share card, and a voice-logged application tracker.

## Core principle: the committee argues, the rubric decides

The LLM never decides your vote.

- The agent **proposes** scores with quotes. **Code checks** that every quote really appears in what you said or pasted; an invented quote scores 0 and shows as "no evidence".
- **Code computes** the votes from verified scores: a weighted score ≥ 1.5 is a HIRE, and each panelist has a red line (the Founder auto-votes NO HIRE if user focus is 0).
- Debate lines are checked the same way: a quote the agent can't back up is dropped.
- Scores only go up across rounds ("best evidence wins"), so an answer can't make you worse.

| Dimension | 0 | 3 |
|---|---|---|
| Ownership | "helped with", "kind of" | "I shipped it", end to end, with a decision you made |
| User focus | no users mentioned | talked to users and changed something because of it |
| Impact | no outcomes | quantified before/after |
| Tradeoffs | no choices | what you chose, what you gave up, and why |

| Panelist | Ownership | User focus | Impact | Tradeoffs |
|---|---|---|---|---|
| 👩‍💼 Product Lead | 0.3 | 0.3 | 0.2 | 0.2 |
| 👨‍💻 Eng Manager | 0.5 | 0.1 | 0.3 | 0.1 |
| 🧑‍🚀 Founder | 0.1 | **0.5** (red line) | 0.3 | 0.1 |

## How the agent works

One tool-calling loop runs the whole interview. Every tool is executed by plain code:

| Tool | What code does with it |
|---|---|
| `score_evidence` | Verifies the quote against your words; unverified → 0 |
| `cast_votes` | Computes votes from verified scores (weights, threshold, vetoes) |
| `panel_say` | Streams one debate line to you live; drops any quote it can't find |
| `ask_candidate` | Pauses the interview and shows you the question (only after the panel has debated) |
| `finish_interview` | Ends the interview (only once votes are current and the panel has reacted) |

The trace of every tool call is shown on screen as it happens.

## Voice

Wispr Flow is the main input, for the career ramble and for every answer to the panel. Real speech is messy, so the agent drops filler words (uh, um, you know) when quoting, resolves self-corrections ("three, no, four years" → four), and keeps hedges like "kind of" because they are evidence.

## Built to survive a live demo

- If the agent fails (no key, API down), the app drops to a fixed pipeline: score → vote → follow-up question → re-score.
- Every LLM call validates its JSON, retries once, then falls back to canned output and shows a **FALLBACK** badge.
- `OPENROUTER_OFF=1` forces the canned path on purpose.

## Run it locally

```bash
cd app
npm install
cp .env.example .env   # set OPENROUTER_KEY
npm test               # 24 rubric tests, no key needed
npm start              # http://localhost:3100
```

Optional: `npm run check-model` confirms the model ID is live; `npm run test:live` checks live scores against hand-written ones.

## Deploy on Render

`render.yaml` at the repo root defines the web service. In the Render dashboard: **New → Blueprint**, pick this repo, and set `OPENROUTER_KEY` when asked. Render runs `npm ci` and `npm start` in `app/`, and checks `/api/health`.

Sessions are stored in `app/data/sessions.json`, which resets whenever the service restarts on Render. That's fine for a demo.

## Stack

Node + Express + vanilla JS, no build step. Dependencies: `express`, `dotenv`. LLM via OpenRouter (Claude Haiku). Tests use the built-in `node --test`.

## Repo layout

```
app/
  server/index.js      routes, streaming interview endpoints
  server/agent.js      the tool-calling interview agent
  server/rubric.js     quote checks, votes, vetoes, ratchet (no LLM)
  server/llm.js        OpenRouter calls, retry, fallback
  server/prompts/      agent, score, debate, skills, plan, parse
  public/              single-page UI
  data/jds/            real job descriptions
  data/demo/           demo ramble + demo answer
  data/fallback/       canned outputs for the demo
  test/                rubric eval suite
PLAN.md                build plan
HACKATHON.md           hackathon brief and problem statements
```

## Disclaimer

Panel is a **simulated** committee for practice. Its opinions are not those of any real company or interviewer.
