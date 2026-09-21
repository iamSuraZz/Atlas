import { desc, sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

/*
 * The single user of this system.
 *
 * `email_verified`, `name` and `image` are not used yet. They exist because
 * Better Auth (M0 task 4) expects exactly those fields on its user table, and
 * adding them now means auth maps onto this row rather than introducing a
 * second, competing notion of "user" that everything downstream has to join.
 *
 * AMENDMENT to docs/DATABASE_DESIGN.md §2: `email` is `text` with a lowercase
 * CHECK rather than `citext`. Citext would have required an extension and a
 * Drizzle custom type to express something the application can guarantee more
 * cheaply by normalising at its own boundary.
 */
export const appUser = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name').notNull(),
    // Nullable: an account without an avatar is normal, not an error state.
    image: text('image'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    // numeric, not a float: weekly hours drive scheduling budgets, and binary
    // floating point cannot represent 11.1 exactly. Drizzle maps this to string.
    weeklyHours: numeric('weekly_hours', { precision: 4, scale: 1 })
      .notNull()
      .default('11.0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // $onUpdate is a Drizzle-layer default: raw SQL updates bypass it. A trigger
    // is the real fix, deferred until something actually writes to this table.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The database refuses mixed-case email rather than trusting every future
    // call site to have normalised first. UNIQUE is only meaningful given this.
    check('app_user_email_lowercase', sql`${t.email} = lower(${t.email})`),
    // '' satisfies NOT NULL, so NOT NULL alone permits a nameless account.
    check('app_user_name_not_empty', sql`${t.name} <> ''`),
    check(
      'app_user_weekly_hours_range',
      sql`${t.weeklyHours} > 0 AND ${t.weeklyHours} <= 60`,
    ),
    // Single-user by construction. A unique index over a constant-true expression
    // permits exactly one row, so a second signup cannot be created by any path —
    // an application bug, a psql session or a future migration alike (rule 4).
    uniqueIndex('app_user_singleton').on(sql`(${t.id} IS NOT NULL)`),
  ],
)

export type AppUser = typeof appUser.$inferSelect
export type NewAppUser = typeof appUser.$inferInsert

/*
 * ─── Better Auth owned tables (M0 task 4) ───────────────────────────────
 *
 * Field *property* names below are dictated by Better Auth: its Drizzle adapter
 * resolves models by the property key on the table object, not by the column
 * name. So properties stay camelCase (`userId`, `credentialID`) while columns
 * stay snake_case. Renaming a property silently breaks the adapter at runtime.
 *
 * Every `id` is database-generated. Better Auth is configured with
 * `advanced.database.generateId: false`, which makes it omit `id` on insert and
 * read back whatever Postgres assigned — so `app_user.id` stays a real uuid
 * rather than an application-generated string.
 */

export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  // Looked up on every request, so it carries its own unique index.
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/*
 * Unused by passkey and magic-link, which store credentials elsewhere. Better
 * Auth's core still expects it to exist, and OAuth or password would land here.
 */
export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Short-lived tokens. Magic-link codes live here until they are used or expire. */
export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passkey = pgTable(
  'passkey',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    credentialID: text('credential_id').notNull(),
    // WebAuthn signature counter. uint32 in the spec, so a device that actually
    // counted past 2^31 would overflow int4 — most report 0 and never move.
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    // No updated_at: Better Auth's passkey schema does not define one.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('passkey_user_id_idx').on(t.userId),
    index('passkey_credential_id_idx').on(t.credentialID),
  ],
)

/*
 * ─── Skill graph (M1 task a) ─────────────────────────────────────────────
 *
 * Shape from docs/DATABASE_DESIGN.md §2; role profiles from DECISIONS.md §5.
 *
 * Skill ids are human-readable paths — 'postgres/indexing' — rather than
 * surrogate keys. The graph is seeded, read constantly and written rarely, and
 * a readable id makes a migration, a log line and a seed diff all legible
 * without a join.
 */

export const masteryState = pgEnum('mastery_state', [
  'UNASSESSED',
  'INTRODUCED',
  'DEVELOPING',
  'PRACTICAL',
  'INTERVIEW_READY',
  'MASTERED',
])

/*
 * The five DATA_ML values are appended, never inserted. `ALTER TYPE ... ADD
 * VALUE` without BEFORE/AFTER appends, and an enum's declaration order is its
 * sort order — reordering would silently change every `ORDER BY category`.
 */
export const skillCategory = pgEnum('skill_category', [
  'ENGINEERING_CORE',
  'BACKEND',
  'DATA',
  'SYSTEMS',
  'QUALITY',
  'AI_ENGINEERING',
  'PROFESSIONAL',
  // ── Data & ML track (DATA_ML_TRACK.md §9.1) ──
  'MATH_STATS',
  'DATA_SCIENCE',
  'MACHINE_LEARNING',
  'DATA_ENGINEERING',
  'MLOPS',
])

export const decayClass = pgEnum('decay_class', [
  'PROCEDURAL_DAILY',
  'CONCEPTUAL',
  'RECALL_HEAVY',
  'NARRATIVE',
])

/*
 * Whether a skill admits an objective artifact at all. LEARNING_ENGINE.md §3.1:
 * communication has none, so it caps at PRACTICAL unless a real interview
 * outcome unlocks it. The mastery gate takes this as an input; before this
 * column existed the screen had to assume every skill had artifacts available.
 */
export const artifactPolicy = pgEnum('artifact_policy', [
  'OBJECTIVE_ARTIFACT_AVAILABLE',
  'NO_OBJECTIVE_ARTIFACT',
])

/*
 * Which curriculum a node belongs to. Redundant with `category` today — the
 * five new categories are all DATA_ML — and kept anyway, because the scheduler
 * filters by track (DATA_ML_TRACK.md §3.2 quotas) and a category should be
 * free to move or be shared later without rewriting every query.
 */
export const skillTrack = pgEnum('skill_track', ['ENGINEERING', 'DATA_ML'])

export const skill = pgTable(
  'skill',
  {
    id: text('id').primaryKey(),
    // Self-referencing: the category tree lives in the table, not in code.
    parentId: text('parent_id').references((): AnyPgColumn => skill.id),
    category: skillCategory('category').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    decay: decayClass('decay').notNull(),
    /*
     * Nullable: NULL means 'not estimated'. LEARNING_ENGINE.md §2 expects a
     * figure per node but no source produces one, and a uniform placeholder is
     * a fabricated number wearing a uniform.
     */
    hoursToPractical: numeric('hours_to_practical', { precision: 4, scale: 1 }),
    artifactPolicy: artifactPolicy('artifact_policy')
      .notNull()
      .default('OBJECTIVE_ARTIFACT_AVAILABLE'),
    marketWeight: numeric('market_weight', { precision: 3, scale: 2 })
      .notNull()
      .default('0.50'),
    track: skillTrack('track').notNull().default('ENGINEERING'),
    /*
     * Curriculum phase, e.g. 'E1' or 'D3' — DATA_ML_TRACK.md §9.2. Nullable so
     * a node added before anyone decides where it belongs is representable.
     *
     * Set on topics AND copied down to their leaves. The scheduler filters
     * candidates, and candidates are leaves; making it join to the parent on
     * every scoring pass to learn the same value is cost with no information.
     */
    phase: text('phase'),
  },
  (t) => [
    check('skill_no_self_parent', sql`${t.id} <> ${t.parentId}`),
    check('skill_market_weight_range', sql`${t.marketWeight} BETWEEN 0 AND 1`),
    check('skill_phase_shape', sql`${t.phase} ~ '^[ED][0-9]{1,2}$'`),
    index('skill_phase_idx').on(t.track, t.phase),
  ],
)

export const skillPrerequisite = pgTable(
  'skill_prerequisite',
  {
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
    requiresId: text('requires_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
    // A soft prerequisite orders the curriculum; a hard one gates it.
    hard: boolean('hard').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.requiresId] }),
    /*
     * Blocks the one-step cycle only. Longer cycles are unreachable in SQL
     * without a recursive trigger, so the acyclicity invariant is asserted by
     * a unit test over the seed instead — see tests/unit/skill-graph.test.ts.
     */
    check('skill_prerequisite_no_self', sql`${t.skillId} <> ${t.requiresId}`),
  ],
)

export const skillState = pgTable(
  'skill_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id),
    state: masteryState('state').notNull().default('UNASSESSED'),
    stabilityDays: numeric('stability_days', { precision: 6, scale: 2 })
      .notNull()
      .default('0'),
    difficulty: numeric('difficulty', { precision: 3, scale: 1 })
      .notNull()
      .default('5.0'),
    lastPractised: timestamp('last_practised', { withTimezone: true }),
    nextReview: timestamp('next_review', { withTimezone: true }),
    // A prior, never a score. Self-rating informs selection; it never sets state.
    selfRating: smallint('self_rating'),
    targetState: masteryState('target_state').notNull().default('PRACTICAL'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.skillId] }),
    check('skill_state_difficulty_range', sql`${t.difficulty} BETWEEN 1 AND 10`),
    check('skill_state_self_rating_range', sql`${t.selfRating} BETWEEN 1 AND 5`),
  ],
)

/*
 * Append-only. A state in skill_state is a claim; this is the reason it was
 * made. Nothing here is ever updated or deleted — the audit trail is the point,
 * and a rewritten history cannot tell you your judgement was wrong.
 */
export const masteryTransition = pgTable('mastery_transition', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  skillId: text('skill_id')
    .notNull()
    .references(() => skill.id),
  fromState: masteryState('from_state').notNull(),
  toState: masteryState('to_state').notNull(),
  reason: text('reason').notNull(),
  evidenceIds: uuid('evidence_ids').array().notNull().default([]),
  automatic: boolean('automatic').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/*
 * ─── Role profiles (DECISIONS.md §5) ─────────────────────────────────────
 *
 * A+B is a blend, not a choice. The scheduler reads effective target and weight
 * as the share-weighted merge across active profiles, so changing track later is
 * a row update rather than a rewrite. D_HIGH_DSA ships seeded but at share 0, so
 * the option is real rather than theoretical.
 */
export const roleProfile = pgTable('role_profile', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
})

export const roleProfileTarget = pgTable(
  'role_profile_target',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => roleProfile.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id),
    targetState: masteryState('target_state').notNull(),
    weight: numeric('weight', { precision: 3, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.skillId] }),
    check('role_profile_target_weight_range', sql`${t.weight} BETWEEN 0 AND 1`),
  ],
)

export const userRoleBlend = pgTable(
  'user_role_blend',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => roleProfile.id),
    share: numeric('share', { precision: 3, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.profileId] }),
    check('user_role_blend_share_range', sql`${t.share} BETWEEN 0 AND 1`),
  ],
)

export type Skill = typeof skill.$inferSelect
export type SkillPrerequisite = typeof skillPrerequisite.$inferSelect
export type SkillState = typeof skillState.$inferSelect

/*
 * ─── Evidence ledger (M1 task d) ─────────────────────────────────────────
 *
 * Shape from docs/DATABASE_DESIGN.md §2, integrity rules from §4, dual
 * approval from DECISIONS.md §6.1.
 *
 * This is the table everything downstream reads: skill promotion, the résumé
 * advisor, the story bank. Its constraints are the reason the product can be
 * honest without relying on prompt instructions — a number with no source
 * cannot be written, so the advisor emits "[NEEDS EVIDENCE: p95 latency]"
 * rather than inventing one. It has no choice.
 */

export const evidenceKind = pgEnum('evidence_kind', [
  'CODE_ARTIFACT',
  'DESIGN_DOC',
  'QUERY_OPTIMISATION',
  'INCIDENT',
  'DECISION',
  'LEADERSHIP_EVENT',
  'COMMUNICATION_REP',
  'INTERVIEW_RESULT',
  'PUBLISHED_WRITING',
  'ASSESSMENT',
])

export const confidentiality = pgEnum('confidentiality', [
  'PUBLIC',
  'EMPLOYER_CONFIDENTIAL',
  'PRIVATE',
])

export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    kind: evidenceKind('kind').notNull(),
    title: text('title').notNull(),
    occurredOn: date('occurred_on').notNull(),

    /*
     * Default-deny. DECISIONS.md §6.1 specifies DEFAULT 'CONFIDENTIAL', which
     * is not a value in the confidentiality enum (§2 defines PUBLIC,
     * EMPLOYER_CONFIDENTIAL, PRIVATE). EMPLOYER_CONFIDENTIAL is the closest
     * and the more restrictive reading.
     */
    classification: confidentiality('classification')
      .notNull()
      .default('EMPLOYER_CONFIDENTIAL'),

    /*
     * Never leaves the database. No repository type carries this field, so
     * there is no code path that can select it into an AI payload — a compile
     * error rather than a runtime check. See src/infra/db/evidence.ts.
     */
    rawBody: text('raw_body').notNull(),
    /*
     * You write this, by hand, as a SANITISE mission. An automatic redactor
     * would both leak and rob you of the practice, and writing the shareable
     * form is the exact skill an interview tests (§6.2).
     */
    shareableBody: text('shareable_body'),
    aiAllowed: boolean('ai_allowed').notNull().default(false),
    publishAllowed: boolean('publish_allowed').notNull().default(false),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    metricValue: numeric('metric_value'),
    metricUnit: text('metric_unit'),
    metricSource: text('metric_source'),
    artifactUrl: text('artifact_url'),
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /*
     * §4.1 — the anti-fabrication constraint. A number without a source and a
     * unit cannot be persisted by any caller, including one that is mistaken
     * about its own instructions.
     */
    check(
      'metric_requires_source',
      sql`${t.metricValue} IS NULL OR (${t.metricSource} IS NOT NULL AND ${t.metricUnit} IS NOT NULL)`,
    ),
    // §4.3 — "verified" is a claim about a thing that exists somewhere.
    check(
      'verified_requires_artifact',
      sql`${t.verified} = false OR ${t.artifactUrl} IS NOT NULL`,
    ),

    // §6.1 — nothing reaches a model without a hand-written shareable form.
    check(
      'ai_needs_shareable',
      sql`${t.aiAllowed} = false OR ${t.shareableBody} IS NOT NULL`,
    ),
    // Publishing is strictly narrower than AI processing, never the reverse.
    check(
      'publish_needs_ai_ok',
      sql`${t.publishAllowed} = false OR ${t.aiAllowed} = true`,
    ),
    // An approval is an act with a timestamp, not a flag that drifted to true.
    check(
      'approval_is_explicit',
      sql`(${t.aiAllowed} = false AND ${t.publishAllowed} = false) OR ${t.approvedAt} IS NOT NULL`,
    ),
  ],
)

export const evidenceSkill = pgTable(
  'evidence_skill',
  {
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidence.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id),
    // True only for executed and verified artifacts. The PRACTICAL gate reads
    // exactly this column, which is why it is not inferred from `kind`.
    objective: boolean('objective').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceId, t.skillId] }),
    // Partial index: the promotion gate only ever asks for objective rows.
    index('evidence_skill_objective_idx')
      .on(t.skillId)
      .where(sql`${t.objective}`),
  ],
)

/*
 * ─── Daily plan and missions (M2 task c) ─────────────────────────────────
 *
 * Shape from docs/DATABASE_DESIGN.md §2.
 *
 * `intensity` and `status` are text with a CHECK rather than enums, matching
 * §2: both are small closed sets that may gain a value, and adding one to a
 * CHECK is an ALTER rather than the enum dance.
 */

export const missionFormat = pgEnum('mission_format', [
  'EXPLAIN',
  'BUILD',
  'DEBUG',
  'READ_CODE',
  'QUERY',
  'DESIGN',
  'DEFEND',
  'TEACH',
  'REVIEW',
  'INTERVIEW',
  'APPLY_TO_PROJECT',
  // ── Data & ML track (DATA_ML_TRACK.md §10.4). The runner does not
  // implement these yet; the values exist so the seed and scheduler can
  // reference them without a second enum migration later.
  'WATCH',
  'NOTEBOOK',
  'MATH_BY_HAND',
  'VISUALIZE',
])

export const dailyPlan = pgTable(
  'daily_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    planDate: date('plan_date').notNull(),
    intensity: text('intensity').notNull(),
    budgetMinutes: integer('budget_minutes').notNull(),
    /*
     * The scheduler weights this plan was built with. Stored per plan rather
     * than read from config at display time, because config is tunable: without
     * this column, changing a weight silently rewrites the reasoning behind
     * every plan already generated. With it, any day's plan can be recomputed
     * exactly as it was.
     */
    weights: jsonb('weights').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One plan per day. Regenerating replaces rather than accumulates.
    unique('daily_plan_user_date_unique').on(t.userId, t.planDate),
    check('daily_plan_intensity', sql`${t.intensity} IN ('LIGHT','NORMAL','DEEP')`),
    check('daily_plan_budget_positive', sql`${t.budgetMinutes} > 0`),
  ],
)

export const mission = pgTable(
  'mission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dailyPlanId: uuid('daily_plan_id')
      .notNull()
      .references(() => dailyPlan.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id),
    format: missionFormat('format').notNull(),
    title: text('title').notNull(),
    brief: text('brief').notNull(),
    /*
     * Generated from the scheduler's own terms, never by a model. Stored as
     * the rendered clauses so the plan reads the same a month later even if
     * the weights have since been tuned.
     */
    why: text('why').array().notNull(),
    estMinutes: integer('est_minutes').notNull(),
    priorityScore: numeric('priority_score', { precision: 6, scale: 3 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    status: text('status').notNull().default('PENDING'),
    /*
     * The expected answer for a MATH_BY_HAND mission:
     * { expected, tolerance, unit, worked }. Null for every other format, and
     * null for MATH_BY_HAND too until something authors problems — which is
     * M3. The runner degrades honestly rather than inventing an answer to
     * check against: no spec means objective_passed stays null.
     */
    checkSpec: jsonb('check_spec'),
    actualMinutes: integer('actual_minutes'),
    confidence: smallint('confidence'),
    reflection: text('reflection'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'mission_status',
      sql`${t.status} IN ('PENDING','IN_PROGRESS','DONE','SKIPPED','EXPIRED')`,
    ),
    check('mission_confidence_range', sql`${t.confidence} BETWEEN 1 AND 5`),

    /*
     * §4.2 constraint 4: exactly one headline mission. A partial unique index
     * is the whole enforcement — indexing only the rows where is_primary is
     * true means the uniqueness applies to those rows and nothing else, so a
     * plan may hold many non-primary missions and exactly one primary.
     */
    uniqueIndex('one_primary_per_plan')
      .on(t.dailyPlanId)
      .where(sql`${t.isPrimary}`),

    /*
     * The 72h format-rotation lookback (§4.2 constraint 2). Partial on
     * status='DONE' because a mission you did not complete did not use up a
     * format, and composite with completed_at DESC so the recent rows for a
     * skill are the leading entries rather than a sort of the whole match.
     */
    index('mission_skill_recent_idx')
      .on(t.skillId, desc(t.completedAt))
      .where(sql`${t.status} = 'DONE'`),
  ],
)

export type DailyPlanRow = typeof dailyPlan.$inferSelect
export type MissionRow = typeof mission.$inferSelect

/*
 * ─── Attempts (M2 task e) ────────────────────────────────────────────────
 *
 * Shape from docs/DATABASE_DESIGN.md §2, with one column omitted:
 * `question_id uuid REFERENCES question(id)` — the `question` table belongs to
 * the adaptive assessment engine, which DECISIONS.md §4 cut. When a question
 * bank exists the column is an additive ALTER.
 *
 * One row per submission. This is the raw record the mastery gate reads:
 * `objective_passed` is authoritative where it is not null, and null means no
 * objective evaluation was possible for that format — which is precisely the
 * distinction §3.1's PRACTICAL gate turns on.
 */
export const attempt = pgTable('attempt', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  /** Null for practice outside a planned mission. */
  missionId: uuid('mission_id').references(() => mission.id),
  /*
   * Deep-dive / interview session, not the auth session. No FK: that table
   * arrives in M3 and naming it here would be a forward reference.
   */
  sessionId: uuid('session_id'),
  skillId: text('skill_id')
    .notNull()
    .references(() => skill.id),
  response: text('response').notNull(),
  /** Authoritative when present — a query plan, a test run, rows returned. */
  objectiveResult: jsonb('objective_result'),
  /** Null when the format admits no objective evaluation. */
  objectivePassed: boolean('objective_passed'),
  /** Advisory only: [{check_id, passed, note}]. Never overrides the objective. */
  rubricResult: jsonb('rubric_result'),
  durationSeconds: integer('duration_seconds'),
  usedHints: smallint('used_hints').notNull().default(0),
  // AI-off drills record this, so an assisted attempt cannot masquerade as solo.
  aiAssisted: boolean('ai_assisted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AttemptRow = typeof attempt.$inferSelect

/*
 * ─── Data & ML track (M-DS task a) ───────────────────────────────────────
 *
 * Shape from docs/DATA_ML_TRACK.md §10.1. Everything here is reference data
 * the curriculum documents own; nothing in this block is user-generated.
 */

/**
 * Which phases the user is working through right now.
 *
 * A table rather than a column on app_user because phases overlap — §9.2 has
 * E1, E2 and D0 active together, and D1 joining in week 4 is an insert, not a
 * rewrite. The scheduler's candidate filter is a join against this, so
 * "activate D1" is one row and takes effect on the next plan.
 */
export const activePhase = pgTable(
  'active_phase',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    phase: text('phase').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.phase] }),
    check('active_phase_shape', sql`${t.phase} ~ '^[ED][0-9]{1,2}$'`),
  ],
)

export const resourceKind = pgEnum('resource_kind', [
  'WATCH',
  'PLAY',
  'COURSE',
  'READ_FREE',
  'READ_BOOK',
  'PRACTISE',
  'TOOL',
])

/**
 * The §8 resource library — what to actually go and learn from.
 *
 * `url` is nullable because §8's "books worth buying" list has titles and no
 * links, and a fabricated Amazon URL would be worse than an honest NULL.
 */
export const resource = pgTable('resource', {
  id: text('id').primaryKey(),
  kind: resourceKind('kind').notNull(),
  title: text('title').notNull(),
  url: text('url'),
  /**
   * NULL means the document does not say. §8 marks Watch/Play/Courses with a
   * tick, titles the next two sections "free online" and "worth buying", and
   * says nothing either way about Practise and Tools. A default of `true`
   * would turn that silence into a claim.
   */
  free: boolean('free'),
  /**
   * The phases §8 tags this resource with, verbatim. Kept alongside
   * `resource_skill` so the derivation that produced those links stays
   * auditable without re-reading the document.
   */
  phases: text('phases').array().notNull(),
  /** §8's caveats, e.g. "Certificate paid; not needed". */
  note: text('note'),
})

/**
 * Resource → skill.
 *
 * DERIVED, and stated as such: §8 tags each resource with phases, not skills,
 * so a link is created to every topic in those phases (§9.2). That is a
 * derivation from two documented facts rather than a judgement about content,
 * which is why it can be regenerated rather than curated.
 */
export const resourceSkill = pgTable(
  'resource_skill',
  {
    resourceId: text('resource_id')
      .notNull()
      .references(() => resource.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.skillId] })],
)

/**
 * The §6 project ladder. Fifteen projects, small to big.
 *
 * Hours are a min/max pair because §6 gives ranges ("6–8"), and collapsing a
 * range to its midpoint would persist a number the document does not state.
 */
export const buildProject = pgTable(
  'build_project',
  {
    id: text('id').primaryKey(),
    /** Ladder position, 1-15. Ordering is the point of a ladder. */
    sequence: integer('sequence').notNull().unique(),
    name: text('name').notNull(),
    level: text('level').notNull(),
    phase: text('phase').notNull(),
    dataSource: text('data_source').notNull(),
    proves: text('proves').notNull(),
    estHoursMin: integer('est_hours_min').notNull(),
    estHoursMax: integer('est_hours_max').notNull(),
    brief: text('brief').notNull(),
  },
  (t) => [
    check('build_project_phase_shape', sql`${t.phase} ~ '^[ED][0-9]{1,2}$'`),
    check('build_project_hours_order', sql`${t.estHoursMin} <= ${t.estHoursMax}`),
    check('build_project_hours_positive', sql`${t.estHoursMin} > 0`),
  ],
)

/** Project → skill. Derived from the project's phase, exactly as resource_skill is. */
export const buildProjectSkill = pgTable(
  'build_project_skill',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => buildProject.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skill.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.skillId] })],
)

/**
 * A project you have finished. M-DS task d.
 *
 * The artifact URL is NOT NULL and non-empty by CHECK, so "completed" and "has
 * a public artifact" are the same fact rather than two that can drift apart.
 * §6: "A project with no public artifact does not count" — enforced here for
 * the same reason `verified_requires_artifact` exists on the evidence ledger,
 * because a rule that lives only in a form handler is a rule until someone
 * writes a second form handler.
 */
export const buildProjectProgress = pgTable(
  'build_project_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => buildProject.id, { onDelete: 'cascade' }),
    artifactUrl: text('artifact_url').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.projectId] }),
    // '' satisfies NOT NULL. This is the constraint that actually bites.
    check('build_project_progress_artifact', sql`${t.artifactUrl} <> ''`),
  ],
)

export type ActivePhase = typeof activePhase.$inferSelect
export type BuildProjectProgress = typeof buildProjectProgress.$inferSelect
export type Resource = typeof resource.$inferSelect
export type BuildProject = typeof buildProject.$inferSelect
