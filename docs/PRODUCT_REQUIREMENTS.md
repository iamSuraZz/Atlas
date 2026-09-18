# PRODUCT REQUIREMENTS
**Part E — what gets built, in what order, and how we know it works**

---

## 1. Product definition

**Atlas** — a single-user personal engineering operating system.

**Primary job:** answer "what should I do in the next 90 minutes, and why that?" with a defensible answer.
**Secondary job:** interrogate you the way a 2026 interview panel does.
**Tertiary job:** maintain an auditable ledger of what you can actually prove.

**Non-goals.** Not a course platform. Not a habit tracker. Not multi-tenant. Not a product for other people. Not a content library — it generates practice against your skill state, it does not host lessons.

## 2. Product principles

| # | Principle | Enforcement |
|---|---|---|
| P1 | Evidence or it didn't happen | Schema constraint: claims require evidence FK |
| P2 | The scheduler explains itself | "Why this" is generated from scheduler weights, not by an LLM |
| P3 | Never fabricate | Metrics require a source; unsourced numbers are rejected at write time |
| P4 | Forgiving by default | No streaks, no XP, no backlog avalanche |
| P5 | The app must not eat the learning | Build time tracked and capped; the app warns you when you exceed it |
| P6 | Confidentiality is structural | Every item classified; confidential content redacted before any AI call |
| P7 | AI triages, evidence decides | LLM output never directly writes a mastery level |

## 3. Feature set

### 3.1 MVP (weeks 1–4)

---

#### F1 — Baseline Assessment
**Milestone M1** · Priority: must

Adaptive, multi-format, ~75 minutes, resumable across sessions.

- Six formats: adaptive MCQ, code comprehension, live SQL against a real Postgres, short written system design, explain-aloud (typed or recorded), project interrogation
- Adaptive rules: 3 consecutive correct → escalate; 2 wrong → drop a level and probe the prerequisite, not the topic
- Produces: initial skill profile, top-10 priorities, an explicit list of what could *not* be assessed
- Self-ratings captured as a **prior only**, never as a score, and the delta between claimed and demonstrated is surfaced because it is diagnostic

**Acceptance**
- Resumable mid-assessment without data loss
- Every resulting skill state traces to a specific attempt row
- Nothing is scored by an LLM alone: MCQ and SQL are objective; written formats use decomposed binary rubrics
- Completes in ≤90 minutes including thinking time

---

#### F2 — Skill Graph & Mastery Engine
**Milestone M1** · Priority: must

~90 seeded skill nodes across 7 categories, DAG with prerequisites. Full model in `LEARNING_ENGINE.md`.

- States: `UNASSESSED → INTRODUCED → DEVELOPING → PRACTICAL → INTERVIEW_READY → MASTERED`
- Promotion is **gated**, not scored. Each transition has explicit requirements
- Decay: time-based regression with per-type half-lives
- Every state change writes an audit row with its justification

**Acceptance**
- Cannot reach `PRACTICAL` without at least one objective artifact
- Cannot reach `INTERVIEW_READY` without ≥2 successful explanations ≥7 days apart
- Skill detail view shows the full evidence chain and the audit history
- Prerequisite violations are blocked and explained

---

#### F3 — Today Engine
**Milestone M2** · Priority: must

The home screen. One primary mission, the rest collapsed.

- Intensity: LIGHT (30–45m) / NORMAL (60–120m) / DEEP (2–4h), switchable mid-day with instant recalculation
- Mission types: EXPLAIN, BUILD, DEBUG, QUERY, DESIGN, DEFEND, TEACH, REVIEW, INTERVIEW, APPLY_TO_PROJECT, READ_CODE
- Format-rotation constraint: no more than two missions of the same format per day, no repeat format on the same skill within 72 hours
- **"Why this today"** rendered from actual scheduler weights: *"Overdue review (11 days) · blocks system design readiness · you rated confidence 2/5 last time"*
- Missed days recalculate silently. No backlog counter anywhere

**Acceptance**
- Changing intensity regenerates the day in under a second
- Skipping seven days produces a *smaller* day-8 plan, not a larger one
- The "why" string is provably derived from scheduler state — unit tested against the weight calculation
- Every mission is completable in its stated time; overruns are logged and feed estimate calibration

---

#### F4 — Project Deep-Dive Interview
**Milestone M3** · Priority: must — **the highest-leverage feature**

Promoted from position 33 in the brief because this is now the decisive interview round and the one that cannot be gamed.

- Project knowledge base: you populate architecture, decisions, trade-offs and incidents for your four real projects (names and raw facts stay in `private/`)
- Adversarial interrogation: one question, wait, challenge weak answers, follow up on vagueness, escalate
- Question generators: technology choice ("why MongoDB?"), failure mode ("what if the Stripe webhook fires twice?"), scale ("10x on the telemetry ingest path?"), regret ("which trade-off would you reverse?"), depth-probe (three levels down on any answer)
- **Confidentiality drill**: some questions probe proprietary detail, and the correct answer is a well-handled deflection. Scored as a skill
- Never reveals the ideal answer until the session ends
- Strong answers are captured into the story bank as evidence

**Acceptance**
- Follow-ups are genuinely responsive to the answer, not pre-scripted
- Vague answers reliably trigger a probe rather than acceptance
- Confidential-flagged project content is redacted before reaching the model
- Session ends with decomposed rubric feedback plus specific gaps routed to the skill graph

---

#### F5 — Evidence Ledger
**Milestone M1, extended M3** · Priority: must

The spine of the whole product. Everything else reads from it.

- Types: code artifact, design doc, query optimisation, incident, decision, leadership event, communication rep, interview result, published writing
- Every item: description, date, project link, skill links, `confidentiality`, verification status
- **Metrics require a source.** A number with no source cannot be saved. This makes the no-fabrication rule structural rather than an instruction to an LLM
- Feeds: mastery promotion, résumé bullets, story bank, readiness matrix

**Acceptance**
- Metric without a source → rejected with a clear message
- Confidential items cannot be exported to public surfaces without an explicit per-item override
- Every résumé bullet renders its evidence chain on hover

---

#### F6 — Decision & Incident Journal
**Milestone M3** · Priority: should — cheap, disproportionately valuable

You listed this as optional. It is one of the best value-per-hour features here.

- Log a real decision or incident in under 60 seconds: what happened, what you chose, why, what you expected
- The app resurfaces it 30 and 90 days later: *"was it right?"* — this is calibration training and it is rare
- Converts into: interview stories, ADR entries, evidence, writing material

---

### 3.2 Deferred, with triggers

| Feature | Trigger | Notes |
|---|---|---|
| **Résumé advisor** | Week 8 | Weak-bullet detection, "needs evidence" markers instead of invented numbers, ATS structure checks (single column, parseable links, real skills section), JD diffing |
| **Communication Lab (text)** | Month 2 | Explain-to-audience drills, written rubrics, same prompts re-run monthly for measurable comparison |
| **Communication Lab (voice)** | Month 3, **only if text version used weekly** | MediaRecorder + transcription. Scores structure, filler density, pace, jargon calibration. **Never accent.** Gated because it is a subsystem and easy to build and never use |
| **Interview simulator (full)** | Month 3 | DSA, system design, backend, frontend, AI, behavioural, leadership, mixed. Includes AI-off timed mode and code-comprehension drills |
| **JD analyser** | First real application | Extract requirements → diff against skill graph → gaps, learning tasks, interview topics, résumé emphasis. Specific, never generic |
| **Mentor mode** | Month 4 | Needs history to be worth anything. Direct, unflattering, evidence-grounded. Weekly and monthly reviews |
| **LinkedIn advisor** | Month 4 | **Pasted text only.** Automated access breaches LinkedIn's User Agreement |
| **Career radar** | Month 5 | JD trend aggregation from *your own* saved JDs, not a market-wide crawler |
| **Job pipeline** | Month 5 | Stages, notes, prep tasks, post-mortems |

### 3.3 Cut

Architecture whiteboard (Excalidraw exists and is better), code-review simulator (real PRs are better), career-path simulator (speculative fiction), achievements/badges/XP (P4), commute mode (build it if you actually want it at Month 6, not before), networking CRM (a note file is enough until it isn't), resource quality scoring (over-engineering), glossary (the skill graph is the glossary).

Each was evaluated against your §64 test — *does this materially improve capability, career outcomes, or learning quality?* Each failed it relative to its build cost.

## 4. Cross-cutting requirements

**Performance.** Today screen interactive < 1.5s on a mid-range laptop. Scheduler recalculation < 300ms. AI responses stream. Nothing blocks on an AI call for a non-AI screen.

**Offline.** Not required. Failing loudly beats failing silently.

**Responsive.** Desktop-first for missions; mobile must support review queue, evidence capture, journal entry, and progress viewing. Mission types requiring code or SQL are desktop-only and say so.

**Accessibility.** Semantic HTML, full keyboard operation including the mission runner, visible focus, AA contrast in both themes, labelled forms, live regions for streaming output. Radix primitives via shadcn give most of this; the mission runner is custom and needs explicit attention.

**Data ownership.** One-click export of everything as JSON + Markdown. One-click delete with confirmation. No telemetry leaves the machine except AI provider calls, and those are logged locally with a token count.

## 5. Definition of done

A feature ships when: types are strict with no `any`; core logic has unit tests; the primary path has an integration test; errors have real states, not blank screens; loading is streamed or skeletoned; keyboard-operable; AI calls are behind the gateway with cost logging; and the docs are updated in the same commit.

## 6. What gets measured

| Question | Metric |
|---|---|
| Is it being used? | Missions completed / scheduled, weekly |
| Is it honest? | Mastery promotions with objective evidence ÷ total promotions. Target 100% above `DEVELOPING` |
| Is it accurate? | Judge agreement against your golden set. Target ≥0.85, measured monthly |
| Is it working? | Real interview outcomes by category over time |
| Is it eating the learning? | Build hours as % of total. Alarm at 30% |
| Is it affordable? | Monthly AI spend against cap |
