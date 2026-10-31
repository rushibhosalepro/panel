# Agentic AI Hackathon '26 — Product Space × Wispr Flow

- Event page: https://theproductspace.in/events/agentic-ai-hackathons
- Problem statements: https://theproductspace.in/ai-hackathon-details/problem-statement
- Submit: https://theproductspace.in/user-dashboard/submissions/agentic-ai-hackathons
- Wispr Flow download: https://ref.wisprflow.ai/productspace

## Hackathon details

| | |
|---|---|
| Hosts | Product Space, in collaboration with Wispr Flow |
| Format | Online |
| Prize pool | ₹50,000 cash |
| Speaker | Akhil Yash Tiwari (Founder, Product Space) |
| Judged on | Product thinking, execution, innovation, presentation |

### Timeline (all times IST)

| When | What |
|---|---|
| 23 Oct 2026 | Registration opened (register and join the WhatsApp group) |
| 31 Oct 2026, 12:30 – 1:30 PM | Kickoff call; problem statements released |
| 31 Oct 2026, after kickoff | Build. Post progress on LinkedIn while you work |
| **31 Oct 2026, 11:59 PM** | **Submission deadline** |

> The page says build time starts at "11:00 AM onwards". That is before the 12:30 PM kickoff, so it is probably a typo. Real build window: about 1:30 PM to 11:59 PM (~10.5 hours).

### Submission requirements

- [ ] **3-minute video** showing the prototype and explaining the solution
- [ ] **Screenshots of Wispr Flow usage** during the build
- [ ] **LinkedIn "AI Building Streak"** posts tagging Product Space (required for the cash prize and the certificate)

### Applies to every problem statement: build with your voice (20% of score)

1. **Build it by voice:** dictate prompts, specs and fixes into your AI builder (Lovable, Bolt, Cursor, Replit, Claude…) with Wispr Flow instead of typing.
2. **Make it work with voice:** the product's main input is natural speech captured through Wispr Flow. Real speech has filler words, digressions and self-corrections, so the agent must turn it into clear, structured output.

---

## Problem statements (pick one)

### 01 — Media: content repurposing studio with brand memory
- Long video or podcast ingestion
- Clip selection with reasons given for each choice
- Captions and copy tailored to each platform
- Brand-voice memory that learns from the creator's edits
- Content calendar
- Performance feedback loop that changes future suggestions based on what actually performed

### 02 — Adaptive exam-prep tutor with a learner model
*Generic AI tutors answer questions but don't track what a student actually understands.*
- Diagnostic test
- Concept graph for one syllabus (e.g. Class 10 physics)
- Learner model that updates mastery for each concept after every answer
- Question generation targeted at weak concepts, with difficulty calibration
- Misconception detection from the reasoning in wrong answers, not just the wrong final answer
- Spaced-repetition scheduling
- Teacher dashboard showing class-wide gaps

### 03 — Meeting-to-execution agent ✅ (chosen)
*Decisions made in meetings get lost.*
- Transcript ingestion with speaker attribution
- Extraction of decisions, action items, owners and deadlines
- Detection of conflicts with earlier decisions stored in memory
- Creation of tasks in a tracker through an integration
- Reminders before deadlines
- Weekly digest per person
- Confirmation step before anything gets posted

> The cross-meeting memory and the conflict detection are what make this a real system rather than a transcript summarizer.

### 04 — Personal finance coach with a living money model
*Most budgeting apps categorize transactions and stop there.*
- Ingestion of bank statements in messy formats (PDF, CSV, transaction SMS), with automatic categorization
- Correction loop: the user fixes a category and the system learns the rule
- Detection of recurring payments and subscriptions, with alerts when one changes or goes unused
- Persistent financial profile: income, fixed costs, emergency fund, goals with target dates
- Goal planner with what-if simulation ("cut dining out by 30%", "rent goes up")
- Nudges when spending drifts off plan
- Monthly review report
- Guardrails: educates and models scenarios, never recommends specific securities

### 05 — Career pivot coach
- Resume and target-role intake
- Skill-gap map built from real job descriptions
- Week-by-week learning plan
- Portfolio project suggestions matched to the gaps
- Mock interviews scored against a rubric
- Progress tracking that adjusts the plan
- Application tracker that learns which kinds of roles get responses

---

## Our idea: voice-first meeting-to-execution agent (Problem 03)

**One line:** Speak a messy meeting or standup into Wispr Flow. The agent turns it into decisions and tasks, catches vague commitments and contradictions with earlier meetings, and only posts to the tracker after you approve each card.

### Why #03
- Voice input fits naturally (dictate meeting notes, or paste or speak a transcript), which covers the 20% voice score.
- Memory and conflict detection are easy to show in a 3-minute video.
- A tracker integration (Notion, Linear or Trello) is quick to wire up.
- It has the most past winning projects to borrow from (below).

### Core flow
1. **Capture:** speech via Wispr Flow (or a transcript), with speaker attribution.
2. **Interpret:** clean up filler words and self-corrections, and propose 2–3 ranked readings when something is ambiguous (from *Second Voice*).
3. **Extract:** decisions, action items, owners, deadlines.
4. **Flag vague commitments:** e.g. "Rahul said *soon*, no date", "*will do*, no owner" → ask before creating the task (from *Conversation-Clarify*).
5. **Check memory for conflicts:** compare new decisions with stored past decisions and show the contradiction with a citation to the earlier meeting (from *Mirror*).
6. **Approval card:** a 30-second card with what was decided, the evidence line from the transcript, and approve / reject only. Nothing is posted without approval (from *OneDecision*).
7. **Execute and verify:** create tasks in the tracker, then read them back and mark them verified (from *Hindsight*).
8. **Follow up:** reminders before deadlines and a weekly digest per person.

### Design principles (taken from past winners)
- **The AI proposes, a person confirms, plain code carries it out.** The LLM never writes or sends anything directly.
- **Memory that visibly improves things.** Show that meeting 2 catches what meeting 1 couldn't.
- **Every claim cites its evidence:** the transcript line or past meeting. Say plainly what couldn't be verified.
- **Use the LLM only where it's good:** interpreting and extracting. Dates, conflict rules and posting are deterministic code.
- **A demo fallback** so the live demo can't fail (from *FluentFlow*).

### 3-minute demo script
1. (0:00) The problem: decisions get lost after meetings.
2. (0:20) Dictate a messy standup with Wispr Flow, including filler words and a self-correction.
3. (0:50) The agent extracts decisions and tasks, and flags "Rahul said 'soon', no date".
4. (1:20) A conflict alert: "This contradicts last Tuesday's decision to delay launch", with a citation.
5. (1:50) Approve the cards → tasks appear in Notion/Linear → read back as verified.
6. (2:30) Weekly digest per person, plus reminders.
7. (2:50) Wrap-up, with Wispr Flow screenshots.

### Past winning projects we're borrowing from

| Project | Hackathon | What we borrow |
|---|---|---|
| [Second Voice](https://devpost.com/software/second-voice-uk1peq) | OpenAI Build Week | Messy speech → ranked candidate readings → confirm before acting |
| [Mirror](https://devpost.com/software/mirror-living-organisational-conscience-rfov1t) | Build with MeDo | Decision memory, scoring decisions against past ones, drift and conflicts |
| [Conversation-Clarify](https://devpost.com/software/conversation-clarify) | CALL-E | Detects replies that sound like answers but aren't ("will do", "soon") |
| [OneDecision](https://devpost.com/software/onedecision) | Agents for Humans | 30-second decision cards, approve/reject only, append-only log |
| [Hindsight](https://devpost.com/software/hindsight-cpxymj) | Build with DataHub | Recall memory before acting; read back every write to verify it |
| [How Did I?](https://devpost.com/software/how-did-i) | Google Cloud Rapid Agent | Diagnose → evidence → draft fix → owner approves |
| [FluentFlow](https://devpost.com/software/fluentflow-3a7d48) | Build with MeDo | Demo fallback path so the live demo never dies |

### Other past winners, if we switch problems
- **#01 Content:** [Fernwood](https://devpost.com/software/fernwood) (brand laws learned from rejections, each citing its critique), [BrandIQ](https://devpost.com/software/brandiq-0r4wxa) (style fingerprint), [Notary](https://devpost.com/software/notary-an-ai-creative-review-board-for-generative-media) (verdict for each criterion)
- **#02 Tutor:** [REPS](https://devpost.com/software/reps-bapvqf) (Feynman probing, solid / shaky / faked), [Dấu](https://devpost.com/software/d-u-see-your-vietnamese-tones) (code grades, the LLM coaches)
- **#04 Finance:** [OneDecision](https://devpost.com/software/onedecision) (teach a rule once and replay it on past cases before turning it on), [Plainletter](https://devpost.com/software/plainletter) (only show verified dates and amounts)
- **#05 Career:** [FluentFlow](https://devpost.com/software/fluentflow-3a7d48) (voice mock interviews with scoring), [ContribPilot](https://devpost.com/software/contribpilot) (ranked, personalized roadmap)
