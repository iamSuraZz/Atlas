# DATABASE DESIGN
**Part H**

PostgreSQL 17 + pgvector. This schema is deliberately a teaching artifact as well as a working one — it exercises composite indexes, partial indexes, check constraints, enums, JSONB, generated columns, window functions and migrations, all of which are on your priority list.

---

## 1. Entity consolidation

Your brief listed ~40 entities. Several were the same thing under different names, and several were premature. Consolidated to 26 core + 6 deferred.

| Your entities | Becomes | Why |
|---|---|---|
| `Quiz`, `Question`, `Answer`, `AssessmentAttempt`, `TaskAttempt` | `question`, `attempt` | One attempt table with a discriminator. Otherwise five near-identical tables and five near-identical queries |
| `Roadmap`, `RoadmapPhase`, `MonthPlan`, `WeekPlan`, `DayPlan` | `plan_period` (self-referencing) + `daily_plan` | A month is a period containing weeks. Recursion, not five tables |
| `Skill`, `SkillCategory` | `skill` with `category` enum + `parent_id` | The graph is the hierarchy |
| `Interview`, `InterviewQuestion`, `InterviewAttempt` | `session`, `session_turn` | Interviews, communication drills and deep-dives share a shape |
| `CommunicationExercise/Attempt`, `BehaviorScenario` | `session` with `kind` | Same |
| `Achievement` | **dropped** | Principle P4 |
| `ResumeVersion` | `resume_snapshot` (JSONB) | Versioning a document, not modelling one |
| `CareerTarget`, `LearningGoal` | `career_target` | One target at a time, by design |

---

## 2. Core schema (DDL sketch)

> **AMENDED 2026-09-19 — M0 task 3, migration `drizzle/0000_warm_lyja.sql`.** The
> `app_user` table as shipped differs from the sketch below in three ways. The sketch
> is left intact as the record of what was originally decided (working rule 8:
> nothing silently removed).
>
> 1. **`email` is `text NOT NULL UNIQUE` with `CHECK (email = lower(email))`, not
>    `citext`.** Citext needs a Postgres extension plus a Drizzle custom type to
>    express a rule the application can guarantee by normalising at its own boundary.
>    The CHECK keeps the guarantee in the database rather than in call-site
>    discipline — without it `UNIQUE` is case-sensitive and `a@b.com` and `A@B.com`
>    would both be storable.
> 2. **`display_name` is replaced by Better Auth's field set** — `name`,
>    `email_verified`, `image` — and `updated_at` is added. M0 task 4 then maps auth
>    onto this table instead of introducing a second user concept that every query
>    would have to join across. These four columns are unused until then.
> 3. **`weekly_hours` defaults to `11.0`, not `12.0`**, matching the 11 h/week
>    planning assumption in `DECISIONS.md` §2.1, and gains
>    `CHECK (weekly_hours > 0 AND weekly_hours <= 60)`.

```sql
-- ─── enums ────────────────────────────────────────────────────────────
CREATE TYPE mastery_state AS ENUM (
  'UNASSESSED','INTRODUCED','DEVELOPING','PRACTICAL','INTERVIEW_READY','MASTERED');

CREATE TYPE skill_category AS ENUM (
  'ENGINEERING_CORE','BACKEND','DATA','SYSTEMS','QUALITY','AI_ENGINEERING','PROFESSIONAL');

CREATE TYPE decay_class AS ENUM (
  'PROCEDURAL_DAILY','CONCEPTUAL','RECALL_HEAVY','NARRATIVE');

CREATE TYPE mission_format AS ENUM (
  'EXPLAIN','BUILD','DEBUG','READ_CODE','QUERY','DESIGN',
  'DEFEND','TEACH','REVIEW','INTERVIEW','APPLY_TO_PROJECT');

CREATE TYPE confidentiality AS ENUM ('PUBLIC','EMPLOYER_CONFIDENTIAL','PRIVATE');

CREATE TYPE evidence_kind AS ENUM (
  'CODE_ARTIFACT','DESIGN_DOC','QUERY_OPTIMISATION','INCIDENT','DECISION',
  'LEADERSHIP_EVENT','COMMUNICATION_REP','INTERVIEW_RESULT','PUBLISHED_WRITING','ASSESSMENT');

CREATE TYPE session_kind AS ENUM (
  'BASELINE','PROJECT_DEEP_DIVE','DSA','SYSTEM_DESIGN','BACKEND','FRONTEND',
  'AI_ENGINEERING','BEHAVIOURAL','LEADERSHIP','COMMUNICATION','MIXED','REAL_INTERVIEW');

-- ─── identity ─────────────────────────────────────────────────────────
CREATE TABLE app_user (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  display_name    text NOT NULL,
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  weekly_hours    numeric(4,1) NOT NULL DEFAULT 12.0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Better Auth owns: session, account, verification, passkey

-- ─── skill graph ──────────────────────────────────────────────────────
CREATE TABLE skill (
  id                 text PRIMARY KEY,              -- 'postgres/indexing'
  parent_id          text REFERENCES skill(id),
  category           skill_category NOT NULL,
  name               text NOT NULL,
  description        text NOT NULL,
  decay              decay_class NOT NULL,
  hours_to_practical numeric(4,1) NOT NULL,
  market_weight      numeric(3,2) NOT NULL DEFAULT 0.50
                       CHECK (market_weight BETWEEN 0 AND 1),
  CHECK (id <> parent_id)
);

CREATE TABLE skill_prerequisite (
  skill_id    text NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  requires_id text NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  hard        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (skill_id, requires_id),
  CHECK (skill_id <> requires_id)
);
-- cycle prevention: recursive CTE check in a trigger + a unit test over the seed

CREATE TABLE skill_state (
  user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  skill_id         text NOT NULL REFERENCES skill(id),
  state            mastery_state NOT NULL DEFAULT 'UNASSESSED',
  stability_days   numeric(6,2) NOT NULL DEFAULT 0,
  difficulty       numeric(3,1) NOT NULL DEFAULT 5.0 CHECK (difficulty BETWEEN 1 AND 10),
  last_practised   timestamptz,
  next_review      timestamptz,
  self_rating      smallint CHECK (self_rating BETWEEN 1 AND 5),  -- prior only, never a score
  target_state     mastery_state NOT NULL DEFAULT 'PRACTICAL',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX skill_state_review_idx
  ON skill_state (user_id, next_review)
  WHERE next_review IS NOT NULL;                      -- partial: the scheduler's hot path
CREATE INDEX skill_state_gap_idx
  ON skill_state (user_id, state, skill_id);

CREATE TABLE mastery_transition (                     -- append-only audit
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  skill_id     text NOT NULL REFERENCES skill(id),
  from_state   mastery_state NOT NULL,
  to_state     mastery_state NOT NULL,
  reason       text NOT NULL,
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  automatic    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

```sql
-- ─── projects ─────────────────────────────────────────────────────────
CREATE TABLE project (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name            text NOT NULL,
  role            text NOT NULL,
  started_on      date, ended_on date,
  summary         text NOT NULL,
  stack           text[] NOT NULL DEFAULT '{}',
  classification  confidentiality NOT NULL,           -- no default: forced decision
  public_url      text,
  repo_url        text
);

CREATE TABLE project_fact (                           -- the deep-dive knowledge base
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN
                   ('ARCHITECTURE','DECISION','TRADEOFF','INCIDENT','CHALLENGE','METRIC','SCALE')),
  title          text NOT NULL,
  body           text NOT NULL,
  classification confidentiality NOT NULL,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_fact_vec_idx ON project_fact
  USING hnsw (embedding vector_cosine_ops);

-- ─── evidence ledger: the integrity core ──────────────────────────────
CREATE TABLE evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind           evidence_kind NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL,
  occurred_on    date NOT NULL,
  project_id     uuid REFERENCES project(id),
  classification confidentiality NOT NULL,

  -- a metric MUST carry a source. This is the anti-fabrication constraint.
  metric_value   numeric,
  metric_unit    text,
  metric_source  text,
  artifact_url   text,
  verified       boolean NOT NULL DEFAULT false,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT metric_requires_source CHECK (
    metric_value IS NULL OR (metric_source IS NOT NULL AND metric_unit IS NOT NULL)
  ),
  CONSTRAINT verified_requires_artifact CHECK (
    verified = false OR artifact_url IS NOT NULL
  )
);

CREATE TABLE evidence_skill (
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  skill_id    text NOT NULL REFERENCES skill(id),
  objective   boolean NOT NULL DEFAULT false,   -- true only for executed/verified artifacts
  PRIMARY KEY (evidence_id, skill_id)
);
CREATE INDEX evidence_skill_objective_idx
  ON evidence_skill (skill_id) WHERE objective;    -- the promotion gate reads this
```

```sql
-- ─── planning & missions ──────────────────────────────────────────────
CREATE TABLE plan_period (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES plan_period(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('PHASE','MONTH','WEEK')),
  seq          integer NOT NULL,
  theme        text NOT NULL,
  objective    text NOT NULL,
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  UNIQUE (user_id, kind, seq),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE daily_plan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  plan_date       date NOT NULL,
  intensity       text NOT NULL CHECK (intensity IN ('LIGHT','NORMAL','DEEP')),
  budget_minutes  integer NOT NULL,
  weights         jsonb NOT NULL,        -- scheduler weights: makes every plan reproducible
  generated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);

CREATE TABLE mission (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id    uuid NOT NULL REFERENCES daily_plan(id) ON DELETE CASCADE,
  skill_id         text NOT NULL REFERENCES skill(id),
  format           mission_format NOT NULL,
  title            text NOT NULL,
  brief            text NOT NULL,
  why              text[] NOT NULL,      -- generated from scheduler weights, never by an LLM
  est_minutes      integer NOT NULL,
  priority_score   numeric(6,3) NOT NULL,
  is_primary       boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','IN_PROGRESS','DONE','SKIPPED','EXPIRED')),
  actual_minutes   integer,
  confidence       smallint CHECK (confidence BETWEEN 1 AND 5),
  reflection       text,
  completed_at     timestamptz
);
CREATE UNIQUE INDEX one_primary_per_plan
  ON mission (daily_plan_id) WHERE is_primary;
CREATE INDEX mission_skill_recent_idx
  ON mission (skill_id, completed_at DESC) WHERE status = 'DONE';

-- ─── attempts & evaluation ────────────────────────────────────────────
CREATE TABLE question (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id       text NOT NULL REFERENCES skill(id),
  format         mission_format NOT NULL,
  difficulty     smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  prompt         text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',   -- options, starter code, seed SQL, rubric id
  expected       jsonb,                          -- key, test cases, expected result set
  generated_by   text NOT NULL DEFAULT 'SEED' CHECK (generated_by IN ('SEED','AI','USER')),
  prompt_version text
);

CREATE TABLE attempt (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  question_id      uuid REFERENCES question(id),
  mission_id       uuid REFERENCES mission(id),
  session_id       uuid,
  skill_id         text NOT NULL REFERENCES skill(id),
  response         text NOT NULL,
  objective_result jsonb,          -- authoritative when present
  objective_passed boolean,        -- NULL when no objective evaluation exists
  rubric_result    jsonb,          -- advisory: array of {check_id, passed, note}
  duration_seconds integer,
  used_hints       smallint NOT NULL DEFAULT 0,
  ai_assisted      boolean NOT NULL DEFAULT false,   -- AI-off drills record this
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempt_skill_time_idx ON attempt (user_id, skill_id, created_at DESC);

-- ─── sessions (interviews, deep dives, comms) ─────────────────────────
CREATE TABLE session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind          session_kind NOT NULL,
  project_id    uuid REFERENCES project(id),
  company       text,                       -- for REAL_INTERVIEW
  difficulty    smallint CHECK (difficulty BETWEEN 1 AND 5),
  ai_allowed    boolean NOT NULL DEFAULT true,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  outcome       text CHECK (outcome IN ('PASSED','FAILED','MIXED','WITHDREW','PENDING')),
  failure_cause text CHECK (failure_cause IN
                  ('KNOWLEDGE_GAP','COMMUNICATION','STRUCTURE','CODING_EXECUTION',
                   'TIME_MANAGEMENT','DESIGN_DEPTH','EXPERIENCE_GAP','NERVES')),
  summary       text
);

CREATE TABLE session_turn (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  role        text NOT NULL CHECK (role IN ('INTERVIEWER','CANDIDATE')),
  content     text NOT NULL,
  probe_type  text,        -- 'DEPTH','TRADEOFF','FAILURE','SCALE','CONFIDENTIALITY'
  rubric_result jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

-- ─── career ───────────────────────────────────────────────────────────
CREATE TABLE career_target (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  archetype      text NOT NULL,        -- 'A_PRODUCT_SENIOR' | 'B_AI_PRODUCT' | ...
  title          text NOT NULL,
  rationale      text NOT NULL,
  active         boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX one_active_target ON career_target (user_id) WHERE active;

CREATE TABLE resume_snapshot (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label      text NOT NULL,
  content    jsonb NOT NULL,          -- structured; bullets carry evidence_ids
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resume_bullet (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  uuid NOT NULL REFERENCES resume_snapshot(id) ON DELETE CASCADE,
  text         text NOT NULL,
  has_metric   boolean NOT NULL DEFAULT false,
  evidence_id  uuid REFERENCES evidence(id),
  CONSTRAINT metric_bullet_needs_evidence CHECK (
    has_metric = false OR evidence_id IS NOT NULL      -- ← §52 made structural
  )
);

CREATE TABLE job_description (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  company     text NOT NULL,
  title       text NOT NULL,
  raw_text    text NOT NULL,
  extracted   jsonb,        -- requirements, seniority signals, stack
  captured_at timestamptz NOT NULL DEFAULT now()
);

-- ─── journal & reviews ────────────────────────────────────────────────
CREATE TABLE journal_entry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('DECISION','INCIDENT','LEARNING','REFLECTION')),
  title          text NOT NULL,
  body           text NOT NULL,
  expectation    text,               -- what you expected to happen
  project_id     uuid REFERENCES project(id),
  classification confidentiality NOT NULL,
  revisit_on     date,               -- +30d and +90d calibration check
  outcome        text,               -- filled at revisit
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE periodic_review (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('WEEKLY','MONTHLY','QUARTERLY')),
  period_start date NOT NULL, period_end date NOT NULL,
  content     jsonb NOT NULL,
  user_notes  text,
  UNIQUE (user_id, kind, period_start)
);

-- ─── ai ledger ────────────────────────────────────────────────────────
CREATE TABLE ai_call (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  task           text NOT NULL,
  provider       text NOT NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  input_tokens   integer NOT NULL,
  output_tokens  integer NOT NULL,
  cost_inr       numeric(10,4) NOT NULL,
  latency_ms     integer NOT NULL,
  cache_hit      boolean NOT NULL DEFAULT false,
  redacted_items integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_call_cost_idx ON ai_call (user_id, created_at DESC);

CREATE TABLE judge_calibration (      -- your golden set: correctness + AI curriculum
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  human_labels  jsonb NOT NULL,       -- your own per-check labels
  judge_labels  jsonb NOT NULL,
  agreement     numeric(4,3) NOT NULL,
  judge_model   text NOT NULL,
  measured_at   timestamptz NOT NULL DEFAULT now()
);
```

---

### 2.1 Known gaps and conventions (recorded M0 task 3)

**`updated_at` is application-maintained. Raw SQL bypasses it. Deferred to M1.**

The Drizzle schema sets `updated_at` via `$onUpdate`, which runs in the application
layer. Any `UPDATE` issued outside Drizzle — psql, a migration, a Neon console
query — leaves `updated_at` stale, and nothing reports it. The fix is a trigger,
deliberately not applied in M0 because nothing writes to `app_user` yet:

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_user_set_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

`BEFORE UPDATE` rather than `AFTER`, because the trigger must modify the row on its
way into storage. `FOR EACH ROW` because a statement-level trigger has no `NEW`.
The function is written once and reused by every table that gains an `updated_at`,
which is why it is not named after `app_user`.

**Every `numeric` column is converted to `number` at the repository boundary.**

The driver returns `numeric` as a string, because Postgres numerics can hold values
no JavaScript number can represent. Converting in `src/infra/db/mappers.ts` — not
with a global type parser, and never with `.$type<number>()` — keeps the conversion
visible at the one place a row crosses into the domain. `.$type<number>()` in
particular would assert a type the driver does not actually produce, so the mismatch
would surface only at runtime.

This applies to **every** numeric column added from here on, not just
`app_user.weekly_hours`. One caveat travels with the rule: `Number` is exact only to
about 15 significant digits. A column wider than that must stay a string or move to
bigint, and the mapper must not pretend otherwise.

---

## 3. Deferred tables

`linkedin_snapshot`, `job_application`, `contact` (networking), `writing_piece`, `market_signal`, `mentor_note` — added with the features that need them. Adding a table later is cheap; carrying six empty ones for months is not.

---

## 4. Integrity: the rules the database enforces

> **AMENDED by `DECISIONS.md` §5–6:** single `classification` enum replaced by dual approval (`ai_allowed` / `publish_allowed`, both default-deny) plus `raw_body`/`shareable_body`. Adds `role_profile*` and `private_vault`.


These are the ones that make the product honest without relying on prompt instructions.

1. **`metric_requires_source`** — a number without a source cannot be persisted. The résumé advisor emits `[NEEDS EVIDENCE: p95 latency]` rather than inventing a figure, because it cannot save one.
2. **`metric_bullet_needs_evidence`** — a résumé bullet claiming a metric must reference an evidence row.
3. **`verified_requires_artifact`** — "verified" requires a URL.
4. **Mandatory `classification`** on `project`, `project_fact`, `evidence`, `journal_entry`, with no default. You must choose. `EMPLOYER_CONFIDENTIAL` rows are filtered by the redaction layer before any AI call and blocked from public export.
5. **Single writer to `skill_state`** — enforced at the repository layer plus a trigger that requires a matching `mastery_transition` row for any state change. The audit trail cannot be bypassed.
6. **`one_primary_per_plan`** — partial unique index. Exactly one headline mission.
7. **`one_active_target`** — partial unique index. One career target at a time, by design.

---

## 5. Indexing notes (and why they're here)

| Index | Type | Purpose | Teaches |
|---|---|---|---|
| `skill_state_review_idx` | Partial B-tree | Scheduler's hottest query; skips ~70% of rows | Partial indexes |
| `evidence_skill_objective_idx` | Partial | Promotion gate reads only objective rows | Partial + boolean predicate |
| `mission_skill_recent_idx` | Composite DESC | 72h format-rotation lookback | Column order, sort direction |
| `attempt_skill_time_idx` | Composite | Retention analysis windows | Composite for range + sort |
| `project_fact_vec_idx` | HNSW | Deep-dive retrieval | Vector indexing |
| `one_primary_per_plan` | Partial unique | Business invariant | Constraints as indexes |

Every one of these should be validated with `EXPLAIN (ANALYZE, BUFFERS)` against seeded data — and that exercise *is* a Month 2 mission. The app's own schema becomes the PostgreSQL curriculum.

## 6. Migrations, seed, backup

- `drizzle-kit` generates, migrations are reviewed and committed as SQL. Never auto-run on boot.
- Seeds: `skills.seed.ts` (~90 nodes + prerequisites), `questions.seed.ts` (~200 starter questions), `demo.seed.ts` (**clearly labelled**, dev only, never in production — your §70.14).
- Backup: nightly `pg_dump` to S3, 30-day retention, plus a monthly restore *test*. An untested backup is not a backup, and testing it is itself a learning task.
