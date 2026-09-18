# AI SYSTEM
**Part I**

This layer is doing double duty: it powers the product, and it *is* the AI-engineering curriculum. Every component here maps to a skill node you need. Build it deliberately and the portfolio artifact writes itself.

---

## 1. Pipeline

```
   caller (domain service)
        │
        ▼
┌───────────────────┐
│  TASK CONTRACT    │  typed: name, input schema, output schema, rubric, budget
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  CONTEXT BUILDER  │  skill state · project facts · session history · retrieval
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  REDACTION        │  ← MANDATORY. Drops EMPLOYER_CONFIDENTIAL, masks identifiers.
│                   │    Fails closed. Unit-tested. No bypass path exists.
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  ROUTER           │  task → model tier, with budget + fallback chain
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  CACHE            │  hash(prompt + version) → response, 7d
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  PROVIDER ADAPTER │  Anthropic · OpenAI · local. Uniform interface
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  VALIDATOR        │  schema parse → repair once → fail loudly
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  COST LEDGER      │  tokens, latency, cache hits, redaction count → ai_call
└───────────────────┘
```

Fails closed at redaction and at validation. A confidentiality bug that fails open is the single worst outcome in this system, worse than any downtime.

---

## 2. Task contracts

Every AI use is a declared contract, not an ad-hoc call site. This is what makes evaluation, caching, cost control and provider swapping possible at all.

```ts
export const TASKS = {
  'assessment.generate_question': {
    tier: 'cheap',
    output: QuestionSchema,
    maxCostInr: 0.50,
    cacheable: true,
    needsProjectContext: false,
  },
  'interview.next_turn': {
    tier: 'frontier',
    output: InterviewTurnSchema,
    maxCostInr: 4.00,
    cacheable: false,
    needsProjectContext: true,       // triggers retrieval + redaction
    stream: true,
  },
  'evaluate.rubric': {
    tier: 'balanced',
    output: RubricResultSchema,
    maxCostInr: 1.50,
    cacheable: true,
    mustDifferFromGenerator: true,   // anti self-preference bias
  },
  'career.analyse_jd': { tier: 'balanced', output: JdAnalysisSchema, maxCostInr: 2.00 },
  'mentor.weekly_review': { tier: 'frontier', output: ReviewSchema, maxCostInr: 8.00 },
} as const
```

Tiers, not model names. The router maps tier → concrete model per provider, so a model deprecation is a config change.

| Tier | Used for | Roughly |
|---|---|---|
| `cheap` | Classification, extraction, question generation, summarising | Small/fast model |
| `balanced` | Rubric evaluation, JD analysis, feedback | Mid model |
| `frontier` | Interview simulation, deep-dive follow-ups, mentor reviews | Best available |

Fallback chain per tier, tried in order on failure, with the degradation surfaced in the UI rather than hidden. Anthropic primary by default; adapters exist for at least one other provider from day one, because an abstraction that has never been exercised against a second implementation is not an abstraction.

---

## 3. Redaction

```ts
function redact(ctx: Context): { text: string; dropped: number } {
  // 1. Drop every fact/evidence row classified EMPLOYER_CONFIDENTIAL
  // 2. Replace known client and employer names with role labels
  //    <employer name> → "[employer]", <client name> → "[client]"
  //    (actual names live in private/ config, never in the repo)
  // 3. Mask hostnames, IPs, S3 buckets, connection strings, API keys by pattern
  // 4. Generalise domain specifics on flagged projects
  //    "well-head pressure sensor tag X" → "[equipment telemetry tag]"
  // 5. Assert: no dropped item's text survives in the output. Throw if it does.
}
```

Tested with a fixture set of confidential strings asserted absent from every outbound payload. This test is a CI gate — a failure blocks deploy.

**Also true and worth stating plainly:** even redacted, this sends work-related context to a third party. Use an API tier with zero-retention terms, and read your employment agreement before Week 1 (`MASTER_PLAN.md` §6).

---

## 4. Interview simulation

The hardest AI component, and the highest value.

**State machine, not a chatbot.**

```
OPENING → PROBE(depth 1) → PROBE(depth 2) → PROBE(depth 3) → PIVOT → CLOSE
              │                  │
              └── weak answer ───┴──▶ CHALLENGE ──▶ re-probe same node
```

Rules encoded in the prompt *and* enforced in code:
- One question per turn. Never a list. Never a hint unless asked.
- Never reveal the ideal answer before `CLOSE` — enforced by post-generation check that flags answer-leakage patterns.
- Vagueness triggers a probe: the generator receives a vagueness signal computed in code (specificity heuristics — named technologies, numbers, concrete failure modes) rather than relying on the model to notice.
- Depth cap of 3 on one thread, then pivot. Prevents the model from grinding a single topic forever.
- Difficulty adapts on a 2-good-answers-up / 1-bad-down rule, computed outside the model.

**Project deep-dive specifics.** Context is retrieved from `project_fact` via pgvector, post-redaction. Question generators are templated by probe type — technology choice, failure mode, scale, regret, confidentiality boundary — so coverage is systematic rather than whatever the model thinks of.

**AI-off mode.** For DSA and code-comprehension drills, the session sets `ai_allowed = false`: no assistant, a visible timer, and the attempt is recorded with `ai_assisted = false`. Mastery weighting treats AI-off attempts as stronger evidence. Given that live rounds increasingly ban assistance and in-person finals have returned, practising exclusively with an assistant in reach is a real hazard.

---

## 5. Evaluation

### 5.1 Rules

1. **Decomposed binary checks only.** No 1–5 holistic scores. The research is clear that holistic scoring is where judges are least reliable and binary rubric checks are where they are most reliable.
2. **Different model judges than generates.** Self-preference bias is well documented.
3. **Position rotation** in any comparison.
4. **Explicit length instruction** — "length is not quality" — because verbosity bias is real.
5. **Judges never write to `skill_state`.** They emit signals; the mastery gate decides.
6. **Objective beats rubric, always.** If tests fail, no amount of rubric approval promotes the skill.

### 5.2 The golden set

Sample ~10% of evaluated attempts. Label them yourself against the same rubric checks. Store both in `judge_calibration`. Monthly, compute agreement.

- Agreement ≥ 0.85 → the rubric is usable
- Agreement < 0.85 → the rubric is the problem, not the model. Rewrite the checks: usually one check is ambiguous or compound
- Agreement drops after a model change → regression, pin the previous model

This is the highest-value thing in the whole AI layer. It keeps the product honest, and it gives you the exact artifact that hiring managers say separates people who have shipped production AI from people who have not: a metric definition, a test set with a rationale for its size and freshness, and a documented failure mode the eval caught.

**Publish the results.** Sanitised, on GitHub. That is your AI-engineering evidence.

---

## 6. Retrieval

Kept minimal on purpose — retrieval is the part most people over-build.

- Corpora: project facts, journal entries, evidence, past session turns
- Chunking: semantic by section, 400–800 tokens, 10% overlap
- Embeddings: 1536-dim in pgvector, HNSW index
- Hybrid: vector + Postgres full-text (`tsvector`), reciprocal-rank fusion
- Rerank: only if hybrid measurably underperforms on your eval set. Measure before adding.
- Grounding: every retrieved chunk carries its source ID; interview questions cite which fact they derive from, so you can audit whether the model invented the premise

**Evaluated, not assumed.** A retrieval eval set of ~50 question→expected-chunk pairs, tracking recall@5 and groundedness. Build the eval before tuning the retriever. That ordering is the entire lesson.

---

## 7. Cost

Assumptions: ~20 missions/week with light AI, 4 interview sessions/month, weekly + monthly reviews.

| Task | Vol/mo | Tier | Est. ₹/mo |
|---|---|---|---|
| Question generation | 300 | cheap | 150 |
| Rubric evaluation | 250 | balanced | 375 |
| Interview turns | 400 | frontier | 1,600 |
| Deep-dive sessions | 8 | frontier | 640 |
| JD analysis | 15 | balanced | 300 |
| Weekly/monthly reviews | 5 | frontier | 400 |
| Embeddings | — | cheap | 50 |
| **Estimated total** | | | **≈ ₹3,500/mo** |

Controls: hard monthly cap at ₹5,000 with a soft warning at 80%; per-task cost ceilings that abort rather than overspend; aggressive caching of deterministic prompts (question generation and rubric evaluation repeat far more than you'd expect); cheap-tier routing by default with escalation only where quality is measurably better — measured on your eval set, not assumed.

Cost per task is visible in the app. Watching it is itself the "latency and cost" skill node.

---

## 8. Prompt management

- Prompts are versioned files in the repo, not strings in components: `prompts/interview/deep_dive.v3.md`
- Every `ai_call` row records `prompt_version` — so a quality change is traceable to a prompt change
- Changing a prompt requires re-running the eval set for affected tasks; regressions block merge
- Structure: XML-tagged sections, examples in the user turn rather than the system prompt when caching matters

This is prompt-as-code, and it is the practice that hiring signals actually reward.

---

## 9. Safety

| Risk | Control |
|---|---|
| Prompt injection via pasted JD or code | Untrusted content wrapped in delimiters and explicitly labelled untrusted; outputs schema-validated; no tool access from JD-analysis tasks |
| Confidential leakage | Redaction, fails closed, CI-gated tests |
| Hallucinated metrics | Schema constraint — the app cannot persist an unsourced number |
| False reassurance about readiness | Simulator caps readiness at `PRACTICAL`; only real outcomes promote |
| Sycophancy in mentor mode | Mentor prompt is grounded in evidence rows and required to cite them; unsupported praise has nothing to cite |
| Model deprecation | Tier indirection + exercised second provider |
