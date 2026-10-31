# Hackathon Ideas — Ranked + Research

> Separate note from HACKATHON.md. Current pick (#03 meeting-to-execution) is kept as Idea #1, sharpened with social-media pain points.

## What social media says is broken

Transcription is solved. Everything after it is not.

1. **70% of AI action items never get completed.** The agent listened, extracted, 7/10 still died. ([Medium, Jun 2026](https://medium.com/@dubowskywebsolutions/the-claude-workflow-that-replaced-my-meeting-notes-877fcf07fc15))
2. **Only 56% leave virtual meetings with clear action items.** ([Reclaim](https://reclaim.ai/blog/this-meeting-could-have-been-an-email?933567f4_page=14&93356805_page=2))
3. **Reddit verdict (r/productivity, r/AiNoteTaker):** summaries feel like reshuffled transcripts; tasks hallucinated or assigned to the wrong person; never land in the right tool. ([7-notetaker test](https://medium.com/@prashantweb3task/i-tested-the-7-best-free-ai-note-takers-in-2026-here-is-what-i-actually-found-4ff8eaa19123))
4. **Bots kill candor:** 58% uncomfortable when a bot joins unexpectedly, 41% change behavior. Clients pause and ask "are we being recorded?" ([Calendly via BuildBetter](https://blog.buildbetter.ai/best-ai-meeting-recorders-without-bots-2026/), [Meetily roundup](https://meetily.ai/blog/bot-free-self-hosted-meeting-transcription/))
5. **Names/speakers wrong, silent failures** — looks live, produces nothing. Top Otter/Granola complaints on Reddit + G2. ([Granola complaints](https://anarlog.so/blog/granola-ai-complaints/), [Otter reviews](https://www.eesel.ai/blog/otter-ai-reviews))
6. **Vague commitments + relitigation:** "soon", "will do", no owner/date. Next meeting re-argues the same decision because nobody recorded _why_. ([LinkedIn](https://www.linkedin.com/pulse/leadership-lever-9-how-close-meeting-right-shane-leaning-htyxc), [Bain/RAPID summary](https://workplace.io/blog/why-your-team-keeps-arguing-about-decisions-you-already-made/))

## Ranked ideas

### 1. [KEEP] Vague-Commitment Catcher + Decision Memory (current #03, reframed) ✅

**One line:** Otter writes it down. We catch what will fail.

- **Input:** botless — dictate messy standup via Wispr Flow, or paste transcript. No bot ever joins a call.
- **Demo beats:**
  1. Flags "Rahul said 'soon', no date" + "'will do', no owner" → must fix before task creation.
  2. "Contradicts Tuesday decision to delay launch" with citation + original reason.
  3. Approve/reject card → post to tracker → read-back verified.
  4. Reminders + weekly digest per person.
- **Why it wins:** hits all 7 required bullets; voice fit is natural; memory + conflict is exactly what judges said separates winners from summarizers; 3-min demo is visual.
- **How to build (~8 hrs):**
  1. Textarea as Wispr dictation target + transcript paste box (screenshots start here).
  2. LLM extract: decisions, tasks, owners, dates + evidence line numbers.
  3. Deterministic rules (no LLM): vague-date list (`soon`, `asap`, `later`), missing-owner check, conflict match vs SQLite/JSON decision log.
  4. Approval cards → Notion API create → read-back verify → mark verified.
  5. Reminders list + weekly digest page generated from stored data.
  6. Canned fallback transcript so live demo can't fail.
- **Principle:** LLM proposes, person confirms, plain code posts. LLM never writes directly.

### 2. Client-Safe Debrief (niche variant of #03)

Same tech, different user: freelancers/agencies who _can't_ put a bot on client calls.

- **Flow:** after the call, dictate a 60-sec voice debrief → agent reconstructs commitments + follow-up email draft + tasks.
- **Positioning:** "No bot joined, nothing recorded, yet nothing lost."
- **Build:** same as #1 minus speaker attribution, plus follow-up email output. Slightly simpler.
- **Pick if:** you fear judges will see "another notetaker" — this niche dodges that.

### 3. Decision Log That Says Why (max differentiation)

Lean 100% into relitigation pain.

- **Core:** every decision stored with date, decider, reason, expiry condition. New decisions auto-scored: supports / contradicts / reopens.
- **Demo:** meeting 2 catches what meeting 1 couldn't — show before/after.
- **Risk:** reminders/digest feel bolted on; harder to show voice value.

### 4. Pivot: Voice Finance What-If Coach (#04)

- **Demo:** speak "rent goes up 10k, can I still hit my Goa goal?" → living money model answers with numbers + chart.
- **Why consider:** far less crowded than meeting notes; voice what-if is a great demo; correction loop ("fix a category once, learns rule") is easy to show.
- **Risk:** PDF/SMS ingestion + categorization in 10 hrs is tight; money-math errors look bad on video. Only switch with a parser ready.

### Skipped

- **#01 Content studio:** video ingestion too heavy for 10 hrs.
- **#02 Tutor:** concept graph + difficulty calibration too heavy.
- **#05 Career coach:** generic, weak voice story.

## Recommendation

Ship **#1 with #2's one-liner**: botless, vague-catcher, contradiction alerts.

**Build order for today:**

1. Transcript + Wispr dictation box working.
2. Extract + vague flags + conflict alert (demo core).
3. Approval cards + Notion post + read-back.
4. Reminders + digest (can be generated static page).
5. Record messy-voice demo (filler + self-correction); keep canned fallback.
