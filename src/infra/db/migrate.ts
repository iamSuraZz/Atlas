import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WrongTargetError,
  assertWritableTarget,
} from '../../../scripts/lib/branch-guard.mjs'

/*
 * Applies committed SQL migrations. Run by hand only:
 *
 *   npm run db:migrate
 *
 * Nothing imports this module, and nothing should — CLAUDE.md rule 7 requires
 * migrations to be an explicit step, never something a boot sequence triggers.
 *
 * Uses the UNPOOLED endpoint. DDL through a pooler is a known way to lose:
 * PgBouncer can route statements to different backend sessions, so anything
 * depending on session state (locks, temp objects) breaks in ways that only
 * appear under concurrency.
 *
 * Caveat inherited from the driver: Neon's HTTP transport has no transactions,
 * so a migration that fails partway is NOT rolled back. Keep each migration
 * small enough that the partial state is obvious and recoverable by hand.
 */

// Resolved from this file, not process.cwd(), so the script works from any directory.
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
)

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_UNPOOLED
  if (!connectionString) {
    throw new WrongTargetError(
      'DATABASE_URL_UNPOOLED is not set. Migrations need the direct, unpooled URL.',
    )
  }

  // Prints where we are connected and aborts if that is not where the loaded
  // env file says it should be. Runs before migrate() touches anything: with
  // no transactions on the HTTP driver, a migration aimed at the wrong branch
  // is not undoable, so the only safe place to catch it is before the first
  // statement.
  await assertWritableTarget(connectionString, 'apply migrations')

  console.log(`\nApplying migrations from ${migrationsFolder}`)
  await migrate(drizzle(neon(connectionString)), { migrationsFolder })
  console.log('Migrations applied.')
}

main().catch((error: unknown) => {
  // A refusal is an operator-facing message, not a crash — print it plainly.
  // Anything else keeps its stack, because it is a genuine failure.
  if (error instanceof WrongTargetError) console.error(`\n${error.message}`)
  else console.error('Migration failed:', error)
  // Exit non-zero, or a failed migration reads as a successful deploy step.
  process.exit(1)
})
