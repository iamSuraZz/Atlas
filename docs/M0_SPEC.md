# M0 — FOUNDATION: BUILD SPECIFICATION

**Budget:** 10 hours across Month 1 (weeks 1–4, ~2.5 h/week)
**Status:** Specified, not started. Awaiting approval.
**Prerequisite:** none. This is the first code written.

The goal of M0 is a deployed, authenticated, empty application with the constraints that make everything after it cheap: strict types, enforced module boundaries, a real migration path, and CI that will refuse bad commits. Nothing user-facing beyond an empty shell.

---

## 1. What M0 is *not*

No skill graph, no scheduler, no AI, no missions, no assessment. Resisting this is the whole discipline. A foundation milestone that grows a feature is how a 10-hour milestone becomes 25.

---

## 2. Repository layout

```
atlas/
├── .github/workflows/ci.yml
├── docs/                          ← the plan travels with the repo
├── drizzle/                       ← generated migrations, committed as SQL
├── src/
│   ├── app/
│   │   ├── (auth)/sign-in/
│   │   ├── (app)/
│   │   │   ├── layout.tsx         ← shell: nav + command palette mount
│   │   │   ├── today/page.tsx     ← placeholder
│   │   │   ├── skills/page.tsx    ← placeholder
│   │   │   ├── projects/page.tsx  ← placeholder
│   │   │   └── career/page.tsx    ← placeholder
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts
│   │   │   └── health/route.ts
│   │   └── layout.tsx
│   ├── domain/                    ← PURE. no framework, no db, no sdk imports
│   │   └── shared/result.ts
│   ├── infra/
│   │   ├── db/{client,schema,migrate}.ts
│   │   ├── auth/server.ts
│   │   └── vercel/                ← the only Vercel-aware code
│   ├── components/ui/             ← Button, Card, Dialog, Input
│   ├── lib/utils.ts               ← cn() and other cross-cutting helpers
│   └── styles/tokens.css
├── tests/{unit,integration,e2e}/
├── .env.example
├── drizzle.config.ts
├── eslint.config.js               ← contains the boundary rule
└── vitest.config.ts
```

The `domain/` directory is empty except for a Result type. It exists from commit one so the boundary rule has something to guard, and so there is never a moment where domain logic "temporarily" lives in a route handler.

---

## 3. Task breakdown

| # | Task | h | Done when |
|---|---|---|---|
| 1 | `create-next-app` (Next 16, App Router, TS, Tailwind v4). `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` | 1.0 | `npm run typecheck` clean |
| 2 | ESLint flat config + Prettier + **the boundary rule** (§4) | 1.0 | A deliberate `import { db }` inside `domain/` fails lint |
| 3 | Neon project, two branches (`main`, `dev`). Drizzle + `@neondatabase/serverless`. First migration: `app_user` only | 1.5 | `npm run db:migrate` applies to a fresh branch |
| 4 | Better Auth: passkey primary, magic-link fallback, single-user, **registration disabled after first signup** | 2.0 | Sign in with a passkey; second signup attempt is rejected |
| 5 | Design tokens (§5) + shadcn init + Button, Card, Dialog, Input | 1.5 | Tokens drive every colour; no hardcoded hex outside `tokens.css` |
| 6 | App shell: 4-item nav, header, ⌘K palette skeleton (opens, closes, no commands yet) | 1.5 | Keyboard-navigable; focus ring visible everywhere |
| 7 | `/api/health` + `/api/health/deep` (DB reachable) | 0.5 | Both return 200 locally and on Vercel |
| 8 | CI: typecheck → lint → unit → build → gitleaks. Vercel preview deploys on PR | 1.0 | A PR with a type error fails before review |

**Total 10.0h.** If a task overruns, the overrun comes out of M1, never out of learning hours.

---

## 4. The boundary rule (the most important 30 lines in the repo)

```js
// eslint.config.js — no-restricted-imports on src/domain/**
{
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['next', 'next/*'],        message: 'domain/ must not import Next.js' },
        { group: ['@/infra/*', 'drizzle*'], message: 'domain/ must not import persistence' },
        { group: ['@anthropic-ai/*', 'openai'], message: 'domain/ must not import an AI SDK' },
        { group: ['react', 'react-dom'],    message: 'domain/ must not import React' },
      ],
    }],
  },
}
```

This is what makes the scheduler and mastery engine — the two components most likely to be wrong — testable in milliseconds without a database. Everything in `TESTING_SECURITY.md` §1.2 depends on it holding from day one, because retrofitting a boundary is a rewrite.

---

## 5. Design tokens

Dark only in M0. Light theme deferred (a v2 cut).

```css
:root {
  --bg: #0A0A0B;  --surface: #111113;  --raised: #1C1C1F;  --border: #26262B;
  --text: #F5F5F7;  --text-2: #A1A1A8;  --text-3: #6E6E76;
  --accent: #E8A33D;  --accent-fg: #0A0A0B;
  --ok: #3FB950;  --fail: #F85149;  --info: #58A6FF;
  --r-card: 8px;  --r-ctl: 6px;
  --font-ui: Inter, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

One accent, used only for the primary action and mastery transitions. Scarcity is what makes it read as important; the moment a second thing is amber it stops meaning anything.

> **AMENDED 2026-09-19 — M0 task 5. Two contrast corrections. The block above is
> unedited; these values supersede it.**
>
> Ratios were computed for every foreground/background pair before the tokens were
> used. Two failed.
>
> 1. **`--text-3` is `#83838B`, not `#6E6E76`.** The original scored 3.92 / 3.73 /
>    3.36 against `--bg` / `--surface` / `--raised` — AA-large only, below the 4.5:1
>    WCAG 2.2 SC 1.4.3 requires for body text. `#83838B` is the minimum that clears
>    4.5:1 on all three, at 5.26 / 5.02 / 4.52.
> 2. **`--border-control: #67676C` is added** alongside `--border`, which keeps its
>    original `#26262B`. SC 1.4.11 requires 3:1 for the visual information that
>    identifies a UI component; `--border` scores 1.31 / 1.25 / 1.13, and the surface
>    fills cannot carry it instead (`--surface` on `--bg` is 1.05). Since 1.4.11 does
>    not govern decorative separators, the two cases take two tokens rather than one
>    compromise. `#67676C` is the minimum clearing 3:1 on `--surface` (3.35) and
>    `--raised` (3.02); `--raised`, as the lightest surface, is the binding constraint.
>
> Also added: `--step-0..4` (13/15/18/24/32 per UX_PLAN §4). No motion token — one
> duration used twice is abstraction ahead of need; the literal 150ms stays inline
> until a third caller appears. The reasoning for the two border tokens is repeated
> in `src/styles/tokens.css` so it survives a later reading of the code alone.

---

## 6. Environment

```bash
DATABASE_URL=                 # Neon pooled
DATABASE_URL_UNPOOLED=        # Neon direct — migrations only
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
VAULT_KEY=                    # 32-byte base64, AES-GCM for private_vault (M1)
# AI provider keys: not added until M3. Nothing needs them before then.
```

`.env` gitignored. `.env.example` documents shape only. `gitleaks` in CI from task 8, before there is anything worth leaking — which is the only time it's cheap to add.

---

## 7. Definition of done

- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` clean on a fresh clone
- [ ] Deployed to Vercel, passkey sign-in works on the deployed URL
- [ ] `/api/health/deep` confirms Neon connectivity in production
- [ ] Boundary rule demonstrably fails on a deliberate violation (commit the failing attempt, then revert — it's the proof the rule works)
- [ ] Migration applies cleanly to a fresh Neon branch
- [ ] Every nav route reachable by keyboard, focus visible, AA contrast verified
- [ ] README: what this is, how to run it, current state, honest "not built yet" list
- [ ] Build time logged: actual vs 10h estimate

That last item matters more than it looks. It is your first calibration data point, and estimate accuracy is a senior skill you currently have no measurement of.

---

## 8. Learning objectives M0 actually delivers

Not a rationalisation — these are checkable, and they are the reason the Month-1 rate is 3 h/week rather than 1.5.

| Skill node | How M0 exercises it |
|---|---|
| `typescript/narrowing` | `noUncheckedIndexedAccess` forces real narrowing on every array access |
| `typescript/utility-types` | Auth and DB types compose through Drizzle's inference |
| `nextjs/app-router` | Route groups, layouts, server vs client boundary |
| `nextjs/rsc-boundaries` | Where `'use client'` goes and why the palette needs it |
| `auth/token-rotation` | Better Auth session config; passkeys are new to you |
| `delivery/ci-cd` | The pipeline, written by hand rather than copied |
| `postgres/migrations` | Drizzle-kit generate → review the SQL → apply. Reviewing the generated SQL is the mission, not running it |
| `security/secrets` | gitleaks, env separation, pooled vs unpooled URLs |

**Associated missions** (these run *as* the build, not after it): explain the RSC boundary aloud in 90 seconds; explain why migrations are forward-only; read the generated SQL for migration 1 and say what each statement does.

---

## 9. Risks specific to M0

| Risk | Mitigation |
|---|---|
| Passkey setup is fiddlier than estimated | Timebox to 2h. If it overruns, ship magic-link only and add passkeys in M1. Auth is not where M0's value is |
| Tailwind v4 + shadcn version friction | Pin exact versions; if it costs more than 30 min, use unstyled Radix directly |
| Scope creep into "just a quick skill list" | The DoD above has no skill graph in it. If it appears, M1 has started and M0 has not finished |
| Estimate is simply wrong | Log actual hours. A 15h M0 is data, not failure — it recalibrates M1–M3 honestly |

---

## 10. On approval

I will work through tasks 1–8 in order, committing per task, keeping `main` runnable throughout, and stopping at the DoD. I will not begin M1.

Before task 1, one thing from you: **confirm the repo is public or private.** It changes the README and nothing else.
