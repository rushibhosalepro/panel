# Panel

Ramble about your career, and three AI interviewers argue about whether to hire you. They stop mid-debate to grill you, you answer by voice, and you watch the vote flip.

I built it because career switchers get rejected without ever learning which sentence cost them the job. Panel lets you hear it.

**Status:** deployed and verified at **https://panel-cqwl.onrender.com**
**Video (3 min):** https://www.youtube.com/watch?v=H-J7F2KsisM
**Built for fun at:** Agentic AI Hackathon '26 (Product Space × Wispr Flow), problem #05 *Career pivot coach*

> The free Render instance naps when idle. The first load can take 30 to 60 seconds. Then it's quick.

## What happens in one run

1. Pick a role (APM at a fintech, or PM at a SaaS company) backed by a real job description. Hold your Wispr Flow key and talk for a minute. Filler words welcome. Paste a resume or cover letter if you want.
2. 👩‍💼 Product Lead, 👨‍💻 Eng Manager and 🧑‍🚀 Founder score you on 4 things (ownership, user focus, impact, tradeoffs), then argue in a group chat, quoting your exact words.
3. Someone has a doubt, so they interrupt: *"Tell me about a time you talked to a customer and changed your plan."* You answer out loud.
4. They re-score, react, and maybe ask again (3 questions max). The banner says "vote so far" until they're done. No verdict while you're still talking.
5. You get a report: the final vote, each panelist's score, every question with your answer, a gap map from the job description, a 4 to 6 week plan, portfolio projects for each gap, and a share card.

On the demo script the vote goes **2–1 → 3–0** after one answer. The Founder vetoes round one because you never mentioned a single user.

## The part I like most: the AI argues, code decides

The panel is an LLM. The vote is not.

- The agent proposes a score with a quote. **Code checks the quote is really in what you said.** If it isn't, the score is 0 and the screen says "no evidence."
- Votes are plain math: weighted score ≥ 1.5 is HIRE. Each panelist has a red line (the Founder's is user focus at 0).
- Debate lines get the same quote check. A quote it can't back up gets dropped, so the panel can't put words in your mouth.
- Scores only go up between rounds. A bad answer can't cost you what you already proved.

| Panelist | Ownership | User focus | Impact | Tradeoffs |
|---|---|---|---|---|
| 👩‍💼 Product Lead | 0.3 | 0.3 | 0.2 | 0.2 |
| 👨‍💻 Eng Manager | 0.5 | 0.1 | 0.3 | 0.1 |
| 🧑‍🚀 Founder | 0.1 | **0.5, red line** | 0.3 | 0.1 |

## How the agent runs the room

One tool-calling loop. The model picks the tool; code runs it.

| Tool | What code does |
|---|---|
| `score_evidence` | Checks the quote against your words. Unverified means 0. |
| `cast_votes` | Computes votes from the verified scores. |
| `panel_say` | Streams one debate line to your screen live. Drops fake quotes. |
| `ask_candidate` | Pauses for your answer. Refused until the panel has debated at least 2 lines. |
| `finish_interview` | Ends it. Refused if votes are stale or nobody reacted to your last answer. |

Every call shows up in the "What the panel is doing" trace as it happens.

## Voice

Wispr Flow is the input for the ramble and every answer. The agent drops "uh", "um" and "you know" when quoting, resolves "three, no, four years" to four, and keeps "kind of" because hedging is evidence. ("I *kind of* handled the launch" is the Product Lead's favourite line.)

## Stack

| Layer | What's running |
|---|---|
| Server | Node 22 + Express, no build step |
| Agent | OpenRouter tool calling, Claude Haiku 4.5 |
| Rules | `rubric.js`: quote checks, weights, vetoes, ratchet. No LLM. |
| UI | One page of vanilla JS, live updates over NDJSON |
| Storage | `data/sessions.json` (resets when Render restarts) |
| Tests | `node --test`, 30 tests, no API key needed |
| Hosting | Render free web service, `render.yaml` blueprint |

## Run it

```bash
git clone https://github.com/rushibhosalepro/panel.git
cd panel/app
cp .env.example .env
npm ci
npm test
npm start
```

Open http://localhost:3100

No key? It still runs. Every AI call falls back to canned demo output and shows a yellow **FALLBACK** badge.

## Environment

| Name | What it's for |
|---|---|
| `OPENROUTER_KEY` | Live AI calls. Leave empty for the canned demo. |
| `OPENROUTER_MODEL` | Model ID. Deployed with `anthropic/claude-haiku-4.5`. |
| `OPENROUTER_DEBATE_MODEL` | Optional bigger model for the fallback debate writer. |
| `OPENROUTER_OFF` | Set to `1` to force canned output on purpose (demo safety switch). |
| `PORT` | Defaults to 3100. Render sets its own. |

## Layout

```
app/
  server/index.js       routes and the streaming interview endpoints
  server/agent.js       the tool-calling interview agent
  server/rubric.js      quote checks, votes, vetoes (no LLM)
  server/llm.js         OpenRouter calls, retry, fallback
  server/prompts/       agent, score, debate, skills, plan, parse
  public/               the single-page UI
  data/jds/             two real job descriptions
  data/demo/            demo ramble and demo answer
  data/fallback/        canned outputs so the demo never dies
  test/                 rubric and agent-loop tests
render.yaml             Render blueprint
PLAN.md                 the build plan, written before the code
```

## What broke (and what I did about it)

- **The verdict showed up while the Founder was still waiting for my answer.** The big "2–1 HIRE ✅" banner read like a final result mid-interview. Now it says "vote so far" until `finish_interview`.
- **Every AI call on Render returned HTTP 402.** The key had a $1 cap with $0.30 left, and without `max_tokens` OpenRouter reserves the model's whole output window (about $0.32) per request. The app quietly fell back to canned answers, so it *looked* fine. Capping `max_tokens` at 2,000 fixed it.
- **Render didn't auto-deploy the fix.** The push landed on GitHub, nothing happened, and I deployed the commit by hand with the Render CLI.

## What this is not

A simulated committee for practice and laughs. It isn't any real company's opinion, and it can't tell you whether you'll actually get hired. It only knows what you told it.
