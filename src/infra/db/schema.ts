import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  uniqueIndex,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
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
