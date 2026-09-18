# TECH DECISIONS

ADR format. Each records the alternatives and what would make us reverse. Writing these is itself practice for the architecture-defence rounds you will sit.

---

### ADR-001 · Next.js 16, App Router
**Accepted.** The App Router is the default for new Next.js projects in 2026; the Pages Router is effectively maintenance-only. Next.js depth is on your learning list and currently sits at "low". RSC substantially reduces the amount of client state you have to manage in a data-heavy app.

*Alternatives:* Remix/React Router 7 (fine, less market weight for you), Vite SPA + separate API (more code, less learning), SvelteKit (wrong for your career).
*Cost:* RSC/client boundaries are a real learning curve. That is the point.
*Reverse if:* server-action ergonomics prove genuinely unworkable for the mission runner.

---

### ADR-002 · TypeScript strict, plus `noUncheckedIndexedAccess`
**Accepted.** Your stated #1 priority. `strict` alone is table stakes; `noUncheckedIndexedAccess` is where people learn what narrowing actually means, and it catches the array-access bugs that otherwise reach production.

*Rule:* zero `any`. `unknown` + narrowing instead. Zero `@ts-expect-error` without a linked issue. CI enforces.
*Cost:* slower early. Correct trade — the friction is the curriculum.

---

### ADR-003 · PostgreSQL 17 + pgvector
**Accepted.** Your largest technical gap and your highest-leverage one. pgvector removes an entire dependency (Pinecone/Qdrant/Weaviate) and teaches vector indexing inside the database you need to learn anyway.

*Alternatives:* MongoDB (you already know it; learning nothing), Postgres + separate vector DB (more infra, no benefit at your data volume), SQLite (insufficient for the concepts you need — no real isolation-level work).
*Reverse if:* never, within this horizon.

---

### ADR-004 · Drizzle ORM, with hand-written SQL for anything analytical
**Accepted — and this is the most deliberate choice in the stack.**

Drizzle is SQL-close TypeScript; Prisma is schema-first abstraction. Prisma 7's Rust-free client closed most of the performance gap, so this is not a performance argument.

It is a learning argument. Prisma's abstraction is *good*, which is exactly the problem: it would let you ship this whole app without writing a window function, reading a query plan, or reasoning about join order. You already know Prisma from prior production work. Drizzle keeps you in SQL.

**Rule:** anything analytical — retention curves, progress aggregation, review-queue scoring — is written as raw SQL with `EXPLAIN` reviewed and a comment recording the plan. Those queries become the PostgreSQL curriculum.

*Alternatives:* Prisma (comfortable, less learning), Kysely (excellent, thinner ecosystem), raw `pg` (no type safety, too much friction).
*Cost:* complex relational queries in Drizzle are verbose.
*Reverse if:* migrations become a recurring time sink — Prisma's migration story is genuinely better.

---

### ADR-005 · Better Auth, passkey-first
**Accepted.** Self-hosted, no vendor, currently the fastest-growing open-source option; Auth.js v5 remains the standard alternative for self-hosted setups. Single user, so the complexity budget is tiny. Passkey primary, email magic-link fallback, no passwords to store or leak.

*Alternatives:* Auth.js v5 (fine; heavier config), Clerk (vendor + cost for one user), rolling your own (no — and being able to say why not is itself an interview answer).
*Learning value:* you already know JWT/refresh patterns; passkeys/WebAuthn you do not. Small, current, differentiating.

---

### ADR-006 · Redis + BullMQ
**Accepted.** On your learning list, and genuinely needed: AI evaluation must not run in a request. Also carries caching, rate limiting and distributed-lock exercises.

*Alternative:* pg-boss (Postgres-backed queue — one less service, but forgoes Redis practice you specifically want).
*Cost:* one more container. Acceptable.

---

### ADR-007 · Tailwind v4 + shadcn/ui
**Accepted.** shadcn is copy-in source over Radix primitives — you own the code, accessibility comes with it, no component-library lock-in. Tailwind v4 is the current default.

*Alternative:* MUI (you know it — learning nothing, and heavier than needed here).

---

### ADR-008 · Vitest + Testing Library + Playwright
**Accepted.** Testing is your biggest engineering gap, and the pyramid here is deliberate:

- **Unit (Vitest)** — the domain layer, no DB, milliseconds. Scheduler, mastery gate, decay, rubric aggregation. This is where most tests live because this is where the bugs matter.
- **Integration (Vitest + Testcontainers Postgres)** — repositories, constraints, migrations. Real database. Verifies that `metric_requires_source` actually fires.
- **E2E (Playwright)** — five flows only: complete a mission, run a deep dive, finish the baseline, log evidence with a metric, switch intensity.

*Rule:* no coverage percentage target. Coverage targets produce tests for getters. The target is *"a bug in the scheduler fails a test."*

---

### ADR-009 · Provider-agnostic AI gateway, Anthropic primary
**Accepted.** Your §49. Tier-based routing rather than model names; a second provider adapter implemented from day one, because an untested abstraction is not an abstraction.

---

### ADR-010 · Modular monolith
**Accepted.** Single user, single deploy. Microservices would add network failure modes and deployment complexity to teach a lesson you do not need. Boundaries are enforced by lint rule instead of by network.

*"Why didn't you use microservices?"* is an interview question. This ADR is the answer.

---

### ADR-011 · Docker Compose on your VPS via Coolify, Traefik for TLS
**SUPERSEDED by ADR-016 (Vercel + Neon).** Retained for the record; the escape hatch was taken deliberately, not by accident.

~~Accepted, with a documented escape hatch.~~ You already run this stack; deepening it compounds with the infra story you can tell in interviews. Full control over Postgres version and extensions.

*Fallback:* Vercel + Neon + Upstash. **Take the fallback if the VPS path costs more than one day.** A working tool beats an infrastructure trophy, and this decision is reversible in an afternoon.

---

### ADR-012 · pino + Sentry + OpenTelemetry
**Accepted.** Observability is a weak area and cheap to add. Traces on AI calls and DB queries mean you *see* an N+1 in a waterfall rather than reading about one.

---

### ADR-013 · No state-management library
**Accepted.** RSC for server state, `useState`/`useReducer` locally, URL for shareable state, TanStack Query only if a genuine client-cache need appears. Adding Zustand or Redux before feeling the pain teaches the wrong instinct.

---

### ADR-014 · Single-user, no multi-tenancy
**Accepted.** `user_id` columns exist so the door stays open, but no tenant isolation, roles, billing or invites. If this ever becomes a product for others, that is a rewrite of the auth and data-access layer — and it should be, with real requirements rather than guessed ones.

---

### ADR-015 · No Kubernetes, GraphQL, event sourcing, CQRS, or microservices
**Accepted.** Each was considered and rejected on cost-versus-benefit for this horizon. Recorded so the omissions are decisions rather than gaps — and so each has a written answer when asked.

---

## Dependency policy

Add a dependency only if: it saves more than a day, is actively maintained, has a plausible removal path, and does not duplicate something already present. Every addition is recorded with its reason in the commit. Target: under 40 production dependencies.

Deliberately *not* adding: date libraries (`Intl` + `Temporal` where available), lodash (the language grew up), a form library until forms actually hurt, an animation library, an icon library beyond lucide.

---

## v2 amendments (18 September 2026)

### ADR-016 · Vercel + Neon, portable behind four interfaces
**Accepted. Supersedes ADR-011.** The 50-hour build budget cannot absorb infrastructure work. Vercel + Neon removes it, and Neon's instant branching turns out to be a *better* SQL sandbox than the Docker design it replaces.

*Portability:* `JobQueue`, `Cache`, `Sandbox`, `BlobStore` are interfaces from commit one; nothing Vercel-specific lives outside `infra/vercel/`. Moving to Coolify = four adapters + a Dockerfile.
*Cost:* serverless constraints on background work and code execution — see ADR-017, ADR-018.
*Reverse if:* Neon cost or cold starts become material, or you want the infra practice more than the hours.

---

### ADR-017 · Postgres job table + Vercel Cron, not BullMQ
**Accepted.** Vercel has no long-lived process. A `job` table drained by a cron route gives durable async work with explicit retries, exponential backoff and idempotency keys.

*Alternatives:* Inngest/Trigger.dev (less code, another vendor, less learning), QStash (same), pg-boss (good — but writing ~150 lines yourself is the point).
*Why the hand-rolled version wins here:* retries, backoff and idempotency are all on your learning list. Importing them teaches nothing; implementing them is a Month-2 mission that also happens to ship a feature.
*Redis survives* via Upstash for caching, rate limiting and locks — off the job path.

---

### ADR-018 · Neon branch for SQL missions, Web Worker for code missions
**Accepted.** No containers on Vercel.

- **SQL:** a Neon branch per session, restricted role, dropped after. Instant, disposable, and teaches branching.
- **JS/TS:** in-browser Web Worker with a hard timeout. Threat model is "me, careless" — a worker covers it.
- **Anything else:** deferred to a Coolify move, if it ever happens.

Objective evaluation survives intact, which is what matters — it is the gate on mastery promotion.

---

### ADR-019 · Role profiles with a weighted blend
**Accepted.** A+B is 0.70/0.30, not a choice between two. `role_profile` / `role_profile_target` / `user_role_blend`; the scheduler reads share-weighted targets. `D_HIGH_DSA` ships seeded and inactive so a track switch is one row update.

*Cost:* ~1h. *Benefit:* the alternative is re-deriving every target level by hand later.

---

### ADR-020 · Confidentiality: dual approval, raw text unreachable by type
**Accepted.** Two independent booleans (`ai_allowed`, `publish_allowed`), both default-deny. `raw_body` stays in the database; only a user-authored `shareable_body` may be sent anywhere.

*Enforcement is a type, not a check:* the repository returns a `ShareableFact` that has no `raw_body` field, so reaching it is a compile error rather than a runtime failure. Runtime redaction is the second layer, not the first.
*Why sanitisation is manual:* writing the shareable version is exactly the interview skill of describing a system without disclosing what you may not disclose. Auto-redaction would both leak and remove the practice.

---

### ADR-021 · Encrypted private vault for compensation
**Accepted.** AES-GCM at the application layer, key from `VAULT_KEY`, separate table, never logged, never in a prompt, never in a public export. A CI test asserts the decrypted values appear in zero outbound AI payloads across the fixture suite.

*Why not just a column:* a plain column survives a careless `SELECT *` into a context builder. Encryption plus a separate table makes the mistake loud.
