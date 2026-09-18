import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
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
  ],
)

export type AppUser = typeof appUser.$inferSelect
export type NewAppUser = typeof appUser.$inferInsert
