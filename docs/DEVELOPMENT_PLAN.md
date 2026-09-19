# DEVELOPMENT PLAN
**Part J**

---

## 1. Reordering, and why

Your §71 listed 15 phases. The dependency analysis says three of them are out of order:

| Your order | Change | Reason |
|---|---|---|
| Phase 12 — Evidence system | **→ MVP (M1)** | Everything reads from it. Building résumé, readiness or mastery before evidence means rewriting all three |
| Phase 9 — Interview simulator | **Project deep-dive → MVP (M3)**, rest → Month 3 | Deep-dive is the decisive 2026 round and needs only the project KB. General simulation needs skill-graph maturity to calibrate |
| Phase 7 — Reviews / spaced repetition | **→ MVP (M2)** | Fused with the scheduler. Bolting spacing onto a finished scheduler is a rewrite |
| Phase 13 — Mentor mode | **→ Month 4** | Needs history. Built early it produces empty generic output and you stop trusting it |

Everything else keeps your order.

## 2. MVP — four weeks, ~57 hours

> **AMENDED by `DECISIONS.md` (v2, 18 Sep 2026).** Read that first — it supersedes this section.



Cap: **3.5 build hours per week**, carved from the dominant theme. The build is the practice for that theme, not additional to it.

---

### M0 — Foundation · 14h · Week 1

| Task | h |
|---|---|
| Next.js 16 + TS strict + lint (incl. `domain/` import ban) + Prettier | 2 |
| Docker Compose: postgres 17 + pgvector, redis, app | 2 |
| Drizzle setup, first migration, seed harness | 2 |
| Better Auth, passkey + magic link, single user | 2 |
| Design tokens, shadcn base, dark + light themes | 3 |
| App shell, six-item nav, ⌘K palette skeleton | 2 |
| GitHub Actions: typecheck, lint, test, build. Health endpoints | 1 |

**Done when:** `docker compose up` gives a running authed app with a working theme toggle, and CI is green on a trivial PR.

---

### M1 — Baseline + Skill Graph + Evidence · 16h · Week 2

| Task | h |
|---|---|
| Skill graph schema + seed (~90 nodes, prerequisites, cycle test) | 3 |
| Mastery state machine + promotion gates + audit trail (**unit tested first**) | 3 |
| Decay + review scheduling (fsrs-lite), pure functions | 2 |
| Evidence ledger + integrity constraints + entry UI | 2 |
| Adaptive assessment engine (selection, escalation, prerequisite probing) | 3 |
| Assessment UI: 6 formats, resumable | 2 |
| Skill profile + skill detail with evidence chain | 1 |

**Done when:** you complete the real baseline, and every resulting state traces to an attempt. This is the first genuinely useful moment.

---

### M2 — Today Engine · 15h · Week 3

| Task | h |
|---|---|
| Scheduler: scoring, constraints, budget fill (**pure, heavily unit tested**) | 4 |
| "Why this today" generator + tests asserting it matches scheduler state | 1 |
| Intensity modes + instant regeneration | 1 |
| Mission runner shell + 6 formats (EXPLAIN, REVIEW, DEBUG, QUERY, DESIGN, BUILD) | 4 |
| Sandbox: isolated container for code + SQL scratch DB | 3 |
| Completion, reflection capture, evidence auto-creation | 1 |
| Missed-day recalculation + tests for the 3/7/14-day cases | 1 |

**Done when:** you can run a real 90-minute day end to end, and skipping a week produces a *smaller* plan.

---

### M3 — Project Deep-Dive · 12h · Week 4

| Task | h |
|---|---|
| Project + project_fact schema, classification, entry UI | 2 |
| Populate the four real projects from `private/projects/` (your time, not code) | 2 |
| AI gateway: contracts, router, cache, cost ledger | 3 |
| **Redaction layer + CI-gated fixture tests** | 2 |
| Deep-dive session engine: state machine, probes, vagueness detection | 2 |
| Rubric evaluation + story bank capture | 1 |

**Done when:** a deep dive on the telemetry platform produces follow-ups you cannot answer, and the confidentiality tests are green.

---

## 3. Post-MVP, with triggers

> **AMENDED by `DECISIONS.md` (v2, 18 Sep 2026).** Read that first — it supersedes this section.



| Milestone | Trigger | Est. |
|---|---|---|
| M4 Résumé advisor | Week 8 | 10h |
| M5 Communication Lab (text) | Month 2 | 12h |
| M6 JD analyser | First real application | 8h |
| M7 Interview simulator (full) | Month 3 | 16h |
| M8 Review + retention analytics | Month 3 | 8h |
| M9 AI eval harness + golden set | Month 4 — **the AI curriculum** | 14h |
| M10 Mentor mode | Month 4 | 10h |
| M11 LinkedIn advisor | Month 4 | 6h |
| M12 Voice communication | Month 3, gated on text usage | 12h |
| M13 Career radar | Month 5 | 8h |
| M14 Job pipeline | Month 5 | 6h |
| M15 Hardening: security review, perf pass, a11y audit | Month 5–6 | 12h |

**Total post-MVP: ~122h across five months ≈ 6h/month.** That fits the 25% cap with room. If it does not fit, features get cut, not weeks added.

### 3.1 Deferred engineering tasks

Added after the v2 revision, so **not** superseded by `DECISIONS.md` — unlike §2–3 above.

| Task | Trigger | Est. |
|---|---|---|
| Switch the migration runner from `drizzle-orm/neon-http` to `drizzle-orm/neon-serverless` (WebSocket) + `ws`, so a migration runs inside a transaction | **M1, before any migration that alters a populated table** | 1h |

The HTTP transport Neon exposes cannot open a transaction. Migration `0000` was a
single `CREATE TABLE`, which Postgres wraps implicitly, and `0001` only creates new
tables — a partial failure there is recoverable by dropping them, and the recovery
command is a comment at the top of the file. Neither property survives contact with
a migration that rewrites existing rows: a failure halfway leaves the table in a
state no rollback undoes.

There is roughly 1.5h of uncommitted budget (`DECISIONS.md` §2.1 against §10), so
this hour comes out of M1's 8h rather than from anywhere new.

---

## 4. Working rules

1. **Runnable at every commit.** `main` always works.
2. **Domain first, UI second.** Scheduler and mastery gate are written and tested before any screen renders them.
3. **Tests with the feature, not after.** The domain layer has no excuse — no DB needed.
4. **One feature per branch.** Small, reviewable, real commit messages. You will read this repo aloud in an interview.
5. **Migrations forward-only.** Reviewed SQL, never auto-applied on boot.
6. **Document in the same commit.** ADRs updated when decisions change.
7. **No fake anything.** No mocked integrations, no stub data outside `demo.seed.ts` (labelled, dev-only).
8. **Nothing silently removed.** If a feature is cut, the ADR says so.
9. **Every AI call goes through the gateway.** No direct SDK calls in components. Lint-enforced.
10. **Weekly build-hours audit.** If build time exceeds 30% of learning time two weeks running, **building stops** until it rebalances. This rule has teeth or the whole plan fails.

## 5. Definition of done

- [ ] Strict types, no `any`, no unexplained `@ts-expect-error`
- [ ] Domain logic unit tested; primary path integration tested
- [ ] Error states real, loading states real, empty states real
- [ ] Keyboard operable, focus visible, AA contrast
- [ ] AI calls through the gateway with cost logged
- [ ] Migration reviewed, seed updated
- [ ] Docs updated in the same commit
- [ ] Runs clean from `docker compose up` on a fresh clone

## 6. What "done" is not

Not a 15-phase completion. The app is done when it is **useful enough to use daily and stops changing much.** Realistically that is M3 plus résumé and interview modes — roughly 100 hours, spread over six months, at which point it gets out of the way and the actual learning happens.

The failure mode to watch for is the pleasant one: the app is always *almost* ready, and building it feels like progress. Rule 10 exists for exactly that.
