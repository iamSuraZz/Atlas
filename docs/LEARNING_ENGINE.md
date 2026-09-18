# LEARNING ENGINE

The adaptive core. This is the part of the product that has to be right; everything else is UI over it.

---

## 1. The loop

```
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  ▼                                                         │
SKILL STATE ──▶ GAP ANALYSIS ──▶ PRIORITY QUEUE ──▶ SCHEDULER
  ▲                  ▲                 ▲                │
  │                  │                 │                ▼
  │            target role        time budget       TODAY'S PLAN
  │            prerequisites      recent formats         │
  │            decay curve        interview date         ▼
  │                                                  MISSION
  │                                                      │
  │                                                      ▼
EVIDENCE ◀── MASTERY GATE ◀── EVALUATION ◀────────── ATTEMPT
                                  │
                         objective + rubric signals
```

Two properties matter. Evidence flows back into skill state — the graph is derived, never hand-set. And evaluation is split: objective signals gate promotion, subjective signals only inform.

---

## 2. Skill graph

A DAG. ~90 nodes at seed across 7 categories.

```
ENGINEERING_CORE
├── typescript { generics, conditional-types, mapped-types, narrowing, utility-types, module-architecture }
├── javascript { event-loop, promises-microtasks, closures, prototypes, memory-gc, streams-backpressure }
├── react      { rendering, reconciliation, hooks-semantics, state-architecture, performance, error-boundaries }
└── nextjs     { app-router, rsc-boundaries, caching, route-handlers, streaming }

BACKEND
├── api-architecture { validation, error-contracts, versioning, pagination }
├── auth             { jwt-risks, sessions, rbac, oauth-oidc, token-rotation }
├── reliability      { idempotency, retries, timeouts, circuit-breaking, dlq }
├── async            { queues, background-jobs, scheduling }
└── observability    { structured-logging, tracing, metrics, alerting }

DATA
├── postgres { schema-design, indexing, explain-analyze, query-optimisation,
│             transactions, isolation-levels, locks-deadlocks, partitioning,
│             connection-pooling, migrations, window-functions, ctes }
├── redis    { caching-patterns, ttl-invalidation, rate-limiting, distributed-locks, pubsub, streams }
└── modelling { normalisation, access-patterns, sql-vs-document-tradeoffs }

SYSTEMS
├── networking      { http, tls, dns, tcp, proxies, load-balancing, cdn }
├── scalability     { horizontal-scaling, caching-layers, replicas, sharding, partitioning }
├── distributed     { cap, consistency-models, replication, failure-modes, partition-tolerance }
├── realtime        { websocket-scaling, presence, ordering, backpressure, reconnection }
└── cloud           { ec2, s3, rds, iam, cloudwatch, sqs, lambda, vpc-basics, secrets }

QUALITY
├── testing  { unit, integration, api, component, e2e, doubles, strategy }
├── security { owasp-top-10, xss, csrf, sqli, ssrf, cors, secrets, rate-limiting }
└── delivery { ci-cd, docker-multistage, environments, rollback }

AI_ENGINEERING
├── evaluation  { golden-sets, rubric-design, judge-bias, regression-gates, cost-latency }   ← entry point
├── llm-core    { tokens, context-windows, structured-outputs, tool-calling, streaming }
├── retrieval   { chunking, embeddings, vector-search, hybrid, reranking, citations, grounding }
├── agents      { state, checkpointing, mcp, human-in-loop, guardrails }
└── ai-security { prompt-injection, data-leakage, output-validation }

PROFESSIONAL
├── communication { explain-to-audience, structure, conciseness, written, presentation }
├── leadership    { ownership, delegation, conflict, feedback, mentoring, decision-making }
├── product       { problem-framing, tradeoffs, prioritisation, what-not-to-build }
└── interview     { dsa-patterns, system-design-framework, behavioural-stories,
                    project-narrative, code-comprehension, negotiation }
```

Each node carries: category, prerequisites[], target level for the chosen archetype, market weight (0–1, from JD analysis), estimated hours to `PRACTICAL`, decay class.

**Why the AI branch starts at `evaluation`:** it is the market's differentiating signal, it is the part that makes the rest measurable, and it is directly buildable inside this app. Starting at tokens/embeddings is the tutorial order, not the competence order.

---

## 3. Mastery model

### 3.1 States and gates

Your §45 model, with explicit, testable promotion requirements.

| State | Meaning | Required to enter |
|---|---|---|
| `UNASSESSED` | No data | default |
| `INTRODUCED` | Encountered it | 1 learning attempt completed |
| `DEVELOPING` | Can follow with support | ≥2 attempts, ≥1 correct at basic difficulty |
| `PRACTICAL` | Can use it unaided | **≥1 objective artifact** + ≥3 successful attempts + all prerequisites ≥ `PRACTICAL` |
| `INTERVIEW_READY` | Can explain and defend under pressure | `PRACTICAL` + **≥2 successful explain-aloud evaluations ≥7 days apart** + ≥1 application to a real project + ≥1 interview-context question answered well |
| `MASTERED` | Durable and teachable | `INTERVIEW_READY` + 1 teach-back + successful recall after ≥30 days + no failed attempt in 60 days |

**What counts as an objective artifact** (this is the anti-hallucination gate):

| Skill type | Objective artifact |
|---|---|
| SQL / Postgres | Query returns correct result against a real DB; `EXPLAIN` shows the intended plan; a measured before/after improvement |
| Code | Tests pass in a sandbox |
| Testing | Coverage delta on a real repo |
| System design | Written design that satisfies a fixed checklist of required considerations (capacity, failure, data model, scale path) — checked structurally |
| Communication | No objective artifact exists → **caps at `PRACTICAL`** without a real interview result |
| AI engineering | Eval harness produces measured results |

Where no objective artifact is possible, the skill cannot exceed `PRACTICAL` from in-app activity alone. Only a **real interview outcome** unlocks `INTERVIEW_READY` for those. This deliberately prevents the simulator from certifying you.

### 3.2 Decay

Each node has a decay class and half-life:

| Class | Half-life | Examples |
|---|---|---|
| `PROCEDURAL_DAILY` | 180 days | React, Node, TS — used at work |
| `CONCEPTUAL` | 90 days | Isolation levels, CAP, indexing internals |
| `RECALL_HEAVY` | 45 days | DSA patterns, framework answers |
| `NARRATIVE` | 120 days, drifts rather than decays | Project stories — need re-rehearsal, not re-learning |

Decay drops one level at 2× half-life without a successful attempt, and pushes the node into the review queue at 1× half-life. Regression writes an audit row and appears in the weekly review — quietly, framed as scheduling rather than failure.

### 3.3 Review scheduling

Simplified FSRS-style at the concept level (not flashcards).

```
stability   s  — days until ~90% recall probability
difficulty  d  — 1..10, intrinsic to the node, updated on failure
retrievability r(t) = exp(-t / s)

on success: s ← s × (1 + f(d) × (1 - r))     harder-and-later reviews grow stability most
on failure: s ← s × 0.5,  d ← min(10, d + 1)

next_review = now + s × ln(1 / target_retention)      target_retention = 0.90
```

Nothing exotic. The value is in applying it to *concepts with varied formats* rather than to flashcards — you review "PostgreSQL indexing" by debugging a slow query, not by flipping a card. Same schedule, different activity, which is also the anti-boredom mechanism (§5).

---

## 4. The scheduler

### 4.1 Priority score

For every candidate skill node:

```
priority =  w1 · gap_size
          + w2 · overdue_factor
          + w3 · role_relevance
          + w4 · interview_proximity
          + w5 · prerequisite_unblocking
          - w6 · recent_saturation
          - w7 · estimated_cost

gap_size               (target_level - current_level) / 5
overdue_factor         days_overdue / half_life, capped at 2.0
role_relevance         market weight for the chosen archetype
interview_proximity    boost when a loop is within 14 days and this category is weak
prereq_unblocking      count of blocked descendants, normalised
recent_saturation      penalty for time spent on this node in the last 72h
estimated_cost         hours to next level, normalised
```

Default weights: `w1=0.30 w2=0.25 w3=0.15 w4=0.10 w5=0.10 w6=0.07 w7=0.03`. Stored in config, tunable, logged per plan so any day's plan is reproducible.

### 4.2 Plan construction

Greedy fill against the minute budget under constraints:

1. **Threads first.** DSA, system design, communication and review get their percentage before the dominant theme takes the rest.
2. **Format rotation.** Max 2 missions of the same format per day; no repeat format on the same node within 72h.
3. **Load shape.** Hardest mission first — you have more capacity at the start of a session.
4. **One primary.** Exactly one mission is the headline; the rest are collapsed. Reduces decision fatigue.
5. **Budget honesty.** If the top-priority mission does not fit the budget, pick a smaller piece of the same node rather than a different node.

### 4.3 LIGHT / NORMAL / DEEP

| | LIGHT 30–45m | NORMAL 60–120m | DEEP 2–4h |
|---|---|---|---|
| Shape | Review + 1 short mission | Full thread coverage + dominant theme | Extended build/design + full coverage |
| Feels like | Complete, not reduced | The default | An investment |
| Copy | "Done for today." | "Done for today." | "Done for today." |

Same completion message. LIGHT is not a lesser day, and the UI must not imply it is.

### 4.4 Missed days

```
days_missed ≤ 2   → nothing. Reviews shift, plan regenerates
days_missed 3–7   → the following plan is SMALLER than usual.
                    Reviews are re-sorted by importance, the tail is dropped, not deferred.
days_missed > 7   → a 10-minute re-entry: one review, one short mission, no catch-up.
                    Decay is applied silently.
```

**No backlog counter exists anywhere in the UI.** There is no number that grows while you are away. This is the single most important motivation decision in the product.

### 4.5 "Why this today"

Generated from the scheduler's own state, never by a model:

```ts
function explain(node: ScoredNode): string[] {
  const parts: string[] = []
  if (node.overdueDays > 0)        parts.push(`Last reviewed ${node.overdueDays}d ago`)
  if (node.blocksCount > 0)        parts.push(`Blocks ${node.blocksCount} skills incl. ${node.topBlocked}`)
  if (node.roleRelevance > 0.7)    parts.push(`High weight for ${node.targetRole}`)
  if (node.lastConfidence != null && node.lastConfidence <= 2)
                                   parts.push(`You rated confidence ${node.lastConfidence}/5 last time`)
  if (node.interviewProximity > 0) parts.push(`Interview in ${node.daysToInterview}d, weakest category`)
  return parts
}
```

Rendered: *"Last reviewed 11d ago · Blocks 3 skills incl. system-design/scalability · You rated confidence 2/5 last time"*

It cannot lie about its reasoning because it is generated from the reasoning. This is a small thing that does a lot of work for trust.

---

## 5. Anti-boredom: format rotation

One concept, ten ways in. The rotation table is the mechanism behind your §24.

| Format | Shape | Good for |
|---|---|---|
| `EXPLAIN` | Explain X to audience Y in Z seconds | Communication + retrieval |
| `BUILD` | Implement it | Procedural |
| `DEBUG` | Here is broken code/query — fix it | Diagnostic |
| `READ_CODE` | Unfamiliar code: what does it do, what breaks it | **2026 interview format** |
| `QUERY` | Live SQL against a seeded DB | Postgres |
| `DESIGN` | System design under constraints | Architecture |
| `DEFEND` | Your position is challenged; hold or concede | Judgement under pressure |
| `TEACH` | Explain to a confused junior who asks bad questions | Deepest form of recall |
| `REVIEW` | Recall from memory, no reference | Spaced repetition |
| `INTERVIEW` | Question with adversarial follow-ups | Interview conditioning |
| `APPLY_TO_PROJECT` | Apply to a real project, or to this app | Transfer |

Selection: exclude formats used on this node in the last 72h; weight toward formats that produce objective artifacts when the node is near a promotion gate; weight toward `EXPLAIN`/`DEFEND` when the node is near `INTERVIEW_READY`.

Worked example — `postgres/indexing` across a month:

| Day | Format | Task |
|---|---|---|
| 1 | BUILD | Design indexes for a real multi-role application-search query |
| 4 | DEBUG | This query does a seq scan on 2M rows — why, and fix it |
| 9 | EXPLAIN | Explain composite index column order to a junior in 90s |
| 17 | INTERVIEW | "When would adding an index make things worse?" + follow-ups |
| 30 | APPLY_TO_PROJECT | Audit a real TimescaleDB index set against actual query patterns |

Same node, five activities, escalating difficulty, spaced.

---

## 6. Evaluation architecture

Two tracks, and they are not equal in authority.

### Track 1 — Objective (authoritative)

| Type | Method |
|---|---|
| MCQ | Key match |
| Code | Sandboxed execution against test cases |
| SQL | Executed against real Postgres; result set + plan compared |
| Design | Structural checklist — does the answer address capacity, data model, failure, scale path, trade-offs |
| Testing | Coverage delta measured on the repo |

### Track 2 — Rubric (advisory only)

Decomposed binary checks, never a holistic score. Judge bias research is unambiguous that this is the reliable configuration and that holistic 1–5 scoring is not.

Example — explaining a technical decision:

```yaml
rubric: explain_technical_decision
checks:
  - id: states_decision_first
    q: "Does the response state the decision within the first two sentences?"
  - id: names_alternative
    q: "Does it name at least one concrete alternative that was considered?"
  - id: gives_reason_not_restatement
    q: "Is the reason a cause, rather than a restatement of the decision?"
  - id: names_tradeoff
    q: "Does it name at least one cost or downside of the chosen option?"
  - id: names_failure_mode
    q: "Does it describe a specific way the choice could fail?"
  - id: audience_calibrated
    q: "Is jargon appropriate to the stated audience?"
  - id: concise
    q: "Is it within 20% of the requested length?"
anti_bias:
  - position_rotation: true      # rotate answer order in any comparison
  - length_notice: "Length is not quality. Do not reward verbosity."
  - separate_judge_model: true   # never judge with the model that generated
```

**Guardrails.** Judges never write to the skill graph. Rubric results are signals the mastery gate consumes. A golden set of your own labelled past answers is maintained, and judge agreement against it is measured monthly with a target ≥0.85 — this is simultaneously a correctness mechanism and your evals curriculum.

---

## 7. Interview readiness matrix

Thirteen independent categories, never a single number:

`DSA · Frontend · Backend · Database · System Design · Distributed Systems · Cloud/Infra · AI Engineering · Security · Testing · Behavioural · Communication · Project Deep Dive`

Each renders as: state, evidence count, last exercised, weakest sub-skill, and **what specifically would raise it**.

Simulator performance caps readiness at `PRACTICAL`. Only real interview outcomes unlock `INTERVIEW_READY`. This is the mechanism that prevents the product from telling you a comfortable lie — your §75 requirement, made structural.

---

## 8. Failure → learning loop

After a poor mission, simulated interview, or real loop, the app runs a structured cause analysis against fixed categories rather than asking an open question:

`KNOWLEDGE_GAP · COMMUNICATION · STRUCTURE · CODING_EXECUTION · TIME_MANAGEMENT · DESIGN_DEPTH · EXPERIENCE_GAP · NERVES`

Each maps to a different remedy. A knowledge gap adds learning tasks; a structure problem adds framework drills; nerves add exposure and timed AI-off reps. Misdiagnosing communication failure as a knowledge gap is the most common and most expensive self-assessment error — the fixed categories exist to prevent it.

The diagnosis is *yours* to confirm. The app proposes; you accept or override. Overrides are logged, because a pattern of overriding one category is itself informative.
