# Working agreement

Read `docs/M0_SPEC.md` before writing code. Build tasks in order; do not start the
next milestone early.

## Hard rules

1. **`src/domain/` stays pure.** No `next`, no `@/infra/*`, no `drizzle`, no AI SDK,
   no `react`. Enforced by ESLint. If logic needs one of those, it belongs in
   `infra/` with a domain-facing interface.
2. **Never commit personal data.** Compensation, employer names, client names, real
   project internals, skill states, evidence. All of it lives in `private/`
   (gitignored) or the database. This repo is intended to go public later, and git
   history cannot be un-committed.
3. **No fake anything.** No mocked integrations, no placeholder data outside
   `demo.seed.ts` (labelled, dev-only). If a thing is not built, it says so.
4. **A metric with no source cannot be persisted.** Enforced by a database CHECK
   constraint, not by prompt instruction. Never invent a number.
5. **Every AI call goes through the gateway** (`infra/ai/`). No SDK imports in
   components or route handlers.
6. **`raw_body` never leaves the database.** Only user-authored `shareable_body`,
   and only when `ai_allowed = true`. The repository type has no `raw_body` field,
   so reaching it is a compile error.
7. **Migrations are forward-only, reviewed as SQL, never auto-run on boot.**
8. **`main` is always runnable.** Commit per task.
9. **Run `npm run check` before every commit.**
10. **Log actual build hours per task** in `private/build-log.md`. The budget is 50h
    total; overruns come out of later milestones, never out of learning time.

## Scope discipline

The whole project fails in one specific way: the app becomes the procrastination.
Budget is ~1.5h/week after Month 1. If a task is not in the current milestone's
spec, it does not get built — it gets written down.

When asked to add something outside the current milestone, say so and record it
rather than building it.

## Style

Plain code over clever code. Explicit over inferred at module boundaries. Error
states, loading states and empty states are real, never blank screens. Comments
explain *why*, never *what*.
