# ARCHITECTURE
**Part G**

---

## 1. Shape

A modular monolith. Single-user, single deployment, clean internal boundaries. Microservices here would be cosplay — and would teach you the wrong lesson about when to split.

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router)                                     │
│                                                              │
│  app/                        RSC pages, route handlers       │
│   ├── (app)/today            server components + islands     │
│   ├── (app)/skills                                           │
│   ├── (app)/projects                                         │
│   ├── (app)/interview        streaming, client-heavy         │
│   ├── (app)/career                                           │
│   ├── (app)/journal                                          │
│   └── api/                   webhooks, SSE, export           │
└───────────────┬──────────────────────────────────────────────┘
                │ server actions / route handlers
┌───────────────▼──────────────────────────────────────────────┐
│  DOMAIN LAYER  (pure TypeScript, no framework imports)       │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│  │ skills   │ │scheduler │ │assessment│ │ evidence     │     │
│  │ graph    │ │ planner  │ │ adaptive │ │ ledger       │     │
│  │ mastery  │ │ explain  │ │ engine   │ │ integrity    │     │
│  │ decay    │ │ budget   │ │          │ │ rules        │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
│  │interview │ │ career   │ │communica-│ │ review       │     │
│  │ sessions │ │ resume   │ │ tion     │ │ scheduling   │     │
│  │ rubrics  │ │ jd-match │ │ rubrics  │ │ (fsrs-lite)  │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘     │
└───────┬──────────────────────┬───────────────┬───────────────┘
        │                      │               │
┌───────▼──────────┐  ┌────────▼───────┐  ┌────▼─────────────┐
│ PERSISTENCE      │  │ AI GATEWAY     │  │ EXECUTION        │
│ Drizzle + SQL    │  │ router · cache │  │ sandbox runner   │
│ repositories     │  │ redaction      │  │ SQL scratch DB   │
│ migrations       │  │ cost ledger    │  │ test harness     │
└───────┬──────────┘  └────────┬───────┘  └──────────────────┘
        │                      │
┌───────▼──────────┐  ┌────────▼────────────────────────────┐
│ PostgreSQL 17    │  │ Providers: Anthropic · OpenAI · local│
│ + pgvector       │  └─────────────────────────────────────┘
└──────────────────┘
┌──────────────────┐  ┌─────────────────────────────────────┐
│ Redis            │  │ BullMQ workers (separate process)   │
│ cache · limits   │  │ evaluation · embeddings · digests   │
└──────────────────┘  └─────────────────────────────────────┘
```

## 2. The one rule that matters

**The domain layer imports nothing from Next.js, Drizzle, or any AI SDK.** Pure functions and interfaces.

Three reasons, in order of importance to you:
1. It is unit-testable without a database, which is how you get a meaningful test suite instead of a slow, flaky one. This is the point of the whole exercise given testing is a top gap.
2. The scheduler and mastery engine are the parts most likely to be wrong. They need to be exercisable in milliseconds.
3. It makes provider and ORM swaps mechanical.

```
domain/scheduler/planner.ts        pure, no imports beyond types
domain/scheduler/planner.test.ts   runs in ~10ms, no DB
infra/db/schedulerRepo.ts          Drizzle lives here only
app/(app)/today/page.tsx           composes them
```

If a PR adds `import { db }` to anything under `domain/`, CI fails. That is an actual lint rule, not a convention.

## 3. Request paths

**Today screen (no AI, must be fast)**
```
RSC → schedulerService.planFor(userId, date, intensity)
    → load skill states + review queue + config   (single query, indexed)
    → score + constrain + explain                 (pure, ~5ms)
    → cache plan in Redis, TTL until midnight
    → render
```
Target < 200ms server time. No AI call on this path, ever. The day's plan is deterministic given skill state; determinism is what makes it testable and reproducible.

**Interview session (AI, streaming)**
```
Client → route handler (SSE)
       → session state from Postgres
       → context builder: skills + project KB + history
       → redaction pass (confidentiality)          ← mandatory, tested
       → AI gateway → provider (streamed)
       → persist turn, enqueue evaluation job
Worker → decomposed rubric evaluation
       → signals persisted
       → mastery gate evaluates promotion
```

The evaluation is **async**. The interview must not stall waiting for a judge, and the judge benefits from being able to take its time.

**Code / SQL mission**
```
Submit → sandbox (isolated container, no network, 5s CPU, 256MB)
       → objective result (pass/fail, plan, output)
       → objective result is authoritative for mastery
       → optional AI commentary, advisory only
```

## 4. Module boundaries

| Module | Owns | Never |
|---|---|---|
| `skills` | Graph, mastery states, decay, promotion gates | Decide *what to do today* |
| `scheduler` | Daily plan, budget, format rotation, explanations | Mutate skill state |
| `assessment` | Adaptive question selection, difficulty | Write mastery directly |
| `evidence` | Ledger, integrity rules, metric-source enforcement | Interpret skills |
| `interview` | Sessions, question generation, follow-up logic | Score mastery |
| `career` | Résumé, JD matching, positioning | Invent claims |
| `review` | Spacing, retrievability, queue | Choose format |
| `ai` | Provider abstraction, routing, redaction, cost | Contain domain logic |

The recurring rule: **only the mastery gate writes skill levels.** Everything else emits signals. A single writer makes the most important invariant in the system auditable.

## 5. Background jobs

BullMQ on Redis, separate worker process.

| Job | Trigger | Why async |
|---|---|---|
| `evaluate-attempt` | Attempt submitted | AI latency |
| `generate-embeddings` | Evidence/journal created | Batched |
| `daily-decay` | 03:00 cron | Cheap, must be reliable |
| `weekly-review` | Sunday 18:00 | Expensive multi-step AI |
| `monthly-review` | Month end | Very expensive |
| `judge-calibration` | Monthly | Golden-set agreement measurement |

Idempotent by design with natural job keys — `evaluate-attempt:{attemptId}`. This is deliberate: idempotency is on your learning list, and here you implement it rather than read about it.

## 6. Sandbox

User code and SQL must execute for objective evaluation. Threat model is "me, but careless" — not hostile — yet still constrained properly because doing it right is the lesson.

- Separate Docker container, no network, read-only FS except `/tmp`, 5s CPU, 256MB, non-root, dropped capabilities
- SQL runs against a disposable seeded database as a role with no access to app schemas; transaction rolled back after capture
- Never on the web process

## 7. Caching

| What | Where | TTL | Invalidated by |
|---|---|---|---|
| Daily plan | Redis | to midnight | Intensity change, mission completion |
| Skill graph shape | Memory | process | Deploy |
| AI responses (deterministic prompts) | Redis, hash key | 7d | Prompt version bump |
| Rendered skill profile | RSC cache | 5m | Mastery change |
| Embeddings | Postgres | — | Source edit |

AI response caching matters more than it looks: assessment questions and rubric evaluations repeat, and cached responses are the difference between ₹2k and ₹8k a month.

## 8. Deployment

> **AMENDED by ADR-016/017/018:** Vercel + Neon. Postgres job table replaces BullMQ; Neon branches and a Web Worker replace the container sandbox.


Primary — your existing infrastructure, because you already run it and it deepens the story:

```
Coolify on your VPS
├── Traefik           TLS, routing
├── web               Next.js standalone
├── worker            BullMQ
├── postgres:17       + pgvector, daily pg_dump to S3
├── redis:7           AOF
└── sandbox-runner    isolated, no network
```

Fallback: Vercel + Neon + Upstash. Faster, less learning, more vendor lock. If the VPS path costs more than a day of yak-shaving, take the fallback and revisit later — the goal is a working tool, not an infrastructure trophy.

Environments: `local` (compose), `staging` (same host, separate stack, seeded demo data), `production`. Migrations run explicitly, never automatically on boot.

## 9. Observability

- `pino` structured JSON, request-scoped correlation IDs
- Sentry for errors, source maps uploaded in CI
- OpenTelemetry traces on AI calls and DB queries — you get to *see* an N+1, which is more instructive than reading about one
- `/api/health` (liveness) and `/api/health/deep` (DB, Redis, provider reachability)
- A local cost dashboard: tokens and spend by task type, daily

## 10. Deliberately excluded

Kubernetes, microservices, GraphQL, event sourcing, CQRS, a service mesh, multi-region. Each would add real complexity and teach a lesson you do not need in the next six months. They are listed here so the omission is a decision rather than an oversight — and so that "why didn't you use X?" has a written answer, which is itself interview practice.
