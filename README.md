# Atlas

A personal engineering operating system: a skill graph with an explainable daily
scheduler, and an adversarial project deep-dive interviewer, backed by an
evidence ledger where every claim traces to something that actually happened.

Single user. Not a product.

---

## Status

**M0 · tasks 1–2 of 8 complete.** Foundation only — the app renders a placeholder page.

| Milestone | Scope | State |
|---|---|---|
| M0 Foundation | Next 16, strict TS, Neon, auth, shell, CI | 🟡 2/8 tasks |
| M1 Skill graph + evidence | Graph, mastery gates, evidence ledger | ⬜ |
| M2 Today engine | Scheduler, explainable "why", mission runner | ⬜ |
| M3 Project deep-dive | Fact model, AI gateway, interrogation | ⬜ |

Not built yet, deliberately: skill graph, scheduler, missions, AI, résumé tooling,
interview simulation. See `docs/M0_SPEC.md` §1 for what M0 is *not*.

Until M2 exists the system runs on a manual protocol in `private/` — markdown files
plus Anki. The app replaces each piece as it is built, so the build is never on the
critical path for the learning it supports.

---

## Privacy model

This repository is **private today and designed to become public without a history
rewrite.** Git history is permanent, so the rule is that personal data is never
committed in the first place rather than scrubbed later.

| Location | Contents | Committed |
|---|---|---|
| `src/`, `docs/`, config | Code and technical design | yes |
| `private/` | Career strategy, compensation, skill states, evidence, project facts, journal | **gitignored** |
| `.env.local` | All secrets | gitignored |
| Database | Everything personal, at runtime | never in repo |

Before ever flipping this repository public:

1. `git log -p | grep -iE 'LPA|salary|CTC|compensation'` returns nothing
2. `gitleaks detect --no-git=false` clean across full history
3. No seed file contains real project facts, employer names, or client names
4. `docs/` contains no compensation figures or employer-confidential architecture

Two planning documents stay in `private/` permanently because they contain
compensation and employer detail: `CAREER_STRATEGY.md` and `DECISIONS.md`.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC), React 19 |
| Language | TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Database | Neon Postgres + pgvector, Drizzle ORM |
| Auth | Better Auth — passkey primary, magic-link fallback |
| Jobs | Postgres `job` table + Vercel Cron, behind a `JobQueue` interface |
| Cache | Upstash Redis |
| UI | Tailwind v4 + shadcn/ui (Radix) |
| Tests | Vitest, Testing Library, Playwright |
| Host | Vercel + Neon, portable to Coolify/VPS |

Reasoning and alternatives for each: `docs/TECH_DECISIONS.md`.

---

## Architecture rule

`src/domain/` imports no framework, no database client, and no AI SDK. Pure
TypeScript, enforced by ESLint and by an automated regression guard.

This exists so the scheduler and mastery engine — the two components most likely to
be wrong — are unit-testable in milliseconds without a database. Retrofitting that
boundary later is a rewrite, so it holds from the first commit.

`npm run verify:boundaries` lints in-memory fixtures through the ESLint API and
fails if a violation is *not* reported — the inverse of a normal lint run. A rule
that silently stops working is worse than no rule, because the codebase drifts
while CI stays green. Twelve cases, including negative controls proving the ban is
targeted rather than blanket.

Three boundaries are enforced:

| Rule | Where it applies |
|---|---|
| No framework, DB, AI SDK or infra imports (type-only included) | `src/domain/**` |
| Database clients only via a repository | everywhere except `src/infra/db/**` |
| AI SDKs only via the gateway | everywhere except `src/infra/ai/**` |

```
src/
├── app/        routes, RSC, server actions
├── domain/     pure logic — scheduler, mastery, decay, rubrics
├── infra/      db, auth, ai, jobs, sandbox — the only place adapters live
└── components/ ui
```

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in Neon + auth values
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the domain boundary rule |
| `npm run format` | Prettier |
| `npm run verify:boundaries` | Asserts the architecture rules still block what they should |
| `npm run check` | typecheck + lint + boundaries + format — run before every commit |
| `npm run build` | Production build |

Requires Node >= 22.

---

## Notes

**Fonts are a system stack, not `next/font/google`.** Google Fonts is fetched at
build time, making the build depend on a third party and fail offline. M0 task 5
self-hosts Inter and JetBrains Mono via `next/font/local`.

**Migrations are forward-only and never run on boot.** `drizzle-kit` generates, the
SQL gets read and committed, then applied as an explicit step.
