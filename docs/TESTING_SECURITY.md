# TESTING, SECURITY & DEPLOYMENT
**Part K**

This document is doing double duty: it is the plan for the app, and it is the syllabus for two of your weakest areas. Build it as specified and the repo becomes the evidence.

---

## 1. Testing

### 1.1 Shape

```
        ╱╲          E2E (Playwright) — 5 flows
       ╱  ╲         slow, brittle, high value. Deliberately few.
      ╱────╲
     ╱      ╲       Integration (Vitest + Testcontainers)
    ╱        ╲      real Postgres. ~40 tests. Verifies constraints and repos.
   ╱──────────╲
  ╱            ╲    Unit (Vitest) — pure domain. ~200 tests, runs in <2s.
 ╱______________╲   This is where the bugs that matter live.
```

**No coverage target.** Coverage targets produce tests for getters. The target is: *a bug in the scheduler, mastery gate, decay function or rubric aggregation fails a test.*

### 1.2 Unit — the domain layer

No database, no network, no framework. Milliseconds.

| Module | What must be tested |
|---|---|
| `scheduler/planner` | Budget never exceeded; format rotation honoured; exactly one primary; threads get their allocation before the dominant theme; missed-day plans are **smaller**; plan is deterministic given identical state |
| `scheduler/explain` | Every "why" string is derivable from scheduler state — property test: no explanation is emitted without a corresponding non-zero weight |
| `skills/mastery` | No promotion past `DEVELOPING` without an objective artifact; `INTERVIEW_READY` requires 2 explanations ≥7 days apart; prerequisite violations blocked; every transition writes an audit row |
| `skills/decay` | Half-lives per class; regression at 2× without practice; review queue entry at 1× |
| `review/scheduling` | Stability grows on success, halves on failure; difficulty rises on failure; intervals monotonic |
| `evidence/integrity` | Metric without source rejected; verified without artifact rejected |
| `ai/redaction` | **Property test:** for any input containing a confidential string, that string never appears in the output. Fails closed on error |
| `interview/probes` | Vagueness detection fires on low-specificity answers; depth cap enforced; no answer leakage before close |

The redaction property test is the single most important test in the codebase.

### 1.3 Integration — real Postgres via Testcontainers

Constraints actually fire (`metric_requires_source`, `metric_bullet_needs_evidence`, `one_primary_per_plan`, `one_active_target`). Migrations apply cleanly from empty and are idempotent. Repositories return correctly shaped data. Prerequisite cycle detection rejects a cycle. `skill_state` cannot be written without a `mastery_transition`.

### 1.4 E2E — exactly five

1. Complete a mission end to end and see the skill state change
2. Run a project deep dive to completion with follow-ups
3. Complete the baseline assessment, resuming mid-way
4. Log evidence with a metric and see it appear in a résumé bullet
5. Switch intensity and watch the day regenerate

Real browser, seeded DB, **AI mocked at the gateway boundary** — E2E tests a UI flow, not a model.

### 1.5 AI evaluation testing

A separate category, because a deterministic test cannot cover a non-deterministic system.

- Golden set of your own labelled answers, agreement measured monthly, target ≥0.85
- Prompt regression: changing a prompt re-runs its eval set; a regression blocks merge
- Schema validation: every AI response parses or fails loudly — never silently degraded
- Cost regression: a task exceeding its budget ceiling fails CI

This is the `ai-engineering/evaluation` skill node, implemented rather than studied.

### 1.6 What is not tested

Styling, animation, third-party library internals, generated Drizzle types, and exact AI output content. Stated explicitly so the omissions are decisions.

---

## 2. Security

### 2.1 Threat model

> **AMENDED by ADR-016:** hosting is Vercel + Neon, not a personal VPS. The threat model below is otherwise unchanged; the host boundary moves to Vercel and Neon.

Single-user app holding: your career history, unpublished project details, possibly employer-confidential architecture, salary expectations, and interview performance data.

Realistic threats, ordered:

| # | Threat | Likelihood | Impact |
|---|---|---|---|
| 1 | Confidential project data leaking to a model provider or a public surface | Med | **Very High** |
| 2 | Exposed instance on the public internet with weak auth | Med | High |
| 3 | Sandbox escape from your own code missions | Low | High |
| 4 | Prompt injection via pasted JD or third-party code | Med | Med |
| 5 | Secrets committed to a public repo | Med | High |
| 6 | Dependency compromise | Low | High |

Note that #1 outranks everything. That is unusual, and it is why the redaction layer gets a CI gate.

### 2.2 Controls

**Auth.** Passkey primary (phishing-resistant), magic-link fallback. Sessions httpOnly + Secure + SameSite=Lax, 30-day rotation. Rate-limited login. Single registered user — registration disabled after first signup.

**Confidentiality.** Mandatory classification. Redaction before every AI call, fails closed. Public export blocked for confidential items without explicit per-item override. Zero-retention API tier.

**Sandbox.** Separate container, no network, read-only FS except `/tmp`, 5s CPU, 256MB, non-root, capabilities dropped, `--pids-limit`. SQL runs on a disposable DB as a restricted role; transaction rolled back.

**Injection.** Untrusted content (pasted JDs, external code) delimited and labelled untrusted. Responses schema-validated. No tool access from tasks that process untrusted input. Parameterised queries everywhere — Drizzle handles this, and the raw-SQL exceptions use parameters, verified by lint.

**Web.** CSP with nonces, no `unsafe-inline`. HSTS. Server actions validate with Zod at the boundary. CSRF via SameSite + origin checks. Rate limiting on all AI endpoints (Redis).

**Secrets.** Never in the repo. `.env` gitignored, `.env.example` documents the shape. Server-side only — no AI key ever reaches the client (your §51). `gitleaks` in CI.

**Dependencies.** `npm audit` in CI, Dependabot weekly, lockfile committed, new deps justified in the commit message.

### 2.3 The security curriculum embedded here

Each control maps to a `security/*` skill node, so implementing it *is* the mission:

| Control | Node | Mission |
|---|---|---|
| CSP with nonces | `security/xss` | Deliberately introduce an XSS sink, watch CSP block it |
| SameSite + origin | `security/csrf` | Write a CSRF attack against your own dev instance |
| Parameterised queries | `security/sqli` | Attempt injection against the SQL scratch DB |
| Sandbox | `security/secrets` + delivery | Attempt escape, document why it fails |
| Redaction | `ai-security/data-leakage` | Write the property test |
| Rate limiting | `redis/rate-limiting` | Implement, then load-test with k6 (you already know k6) |

An OWASP Top 10 pass against this app, documented, becomes a portfolio artifact and interview material.

---

## 3. Privacy and data ownership

Your §51, implemented:

- **Export** — one click, full JSON + Markdown, including every attempt, evidence row and session transcript
- **Delete** — one click, cascade, confirmation required. Real deletion, not a flag
- **Local by default** — nothing leaves the machine except AI provider calls, each logged with token count and redaction count
- **Minimal logging** — request logs carry no response bodies; AI logs carry token counts and prompt versions, not full prompts, unless debug mode is explicitly on
- **Compensation data** — stored, never sent to any model. Enforced by the redaction layer's deny list, not by remembering

---

## 4. Deployment

### 4.1 Environments

| | Local | Staging | Production |
|---|---|---|---|
| Where | Docker Compose | Same VPS, separate stack | VPS via Coolify |
| Data | Seeded demo (labelled) | Seeded demo | Real, backed up |
| AI | Mocked or cheap tier | Cheap tier | Full routing |
| Migrations | `db:push` | Explicit | Explicit, reviewed |

### 4.2 Pipeline

```
push → typecheck → lint (incl. domain import ban) → unit → integration (Testcontainers)
     → build → gitleaks → npm audit → E2E on PR
     → merge to main → build image → deploy staging → smoke → manual promote to prod
```

Manual promotion. For a single-user app there is no case for automatic production deploys, and the explicit gate is good practice to internalise.

### 4.3 Operations

- Migrations run as an explicit step, never on boot
- Rollback: previous image + reverse migration, both tested at least once before you rely on them
- Backups: nightly `pg_dump` to S3, 30-day retention, **monthly restore test** — an untested backup is not a backup, and testing it is a scheduled learning task
- Health: `/api/health` liveness, `/api/health/deep` checks DB, Redis and provider reachability
- Alerts: Sentry to email. No pager. This is a personal app and 3am alerts would be theatre

### 4.4 Performance budgets

| | Target |
|---|---|
| Today screen TTI | < 1.5s |
| Scheduler recalculation | < 300ms |
| Mission open | < 500ms |
| AI first token | < 2s |
| DB query p95 | < 50ms |

Measured, not assumed — OpenTelemetry traces plus a monthly check. When a budget is missed, the investigation is a `performance` mission. You get to practise profiling on a system you fully understand, which is the best possible way to learn it.
