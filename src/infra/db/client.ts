import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { endpointMismatch, mismatchMessage } from '@/lib/neon-endpoint'
import * as schema from './schema'

export type Db = NeonHttpDatabase<typeof schema>

/*
 * Runtime queries use the POOLED connection. Neon's pooler is what makes a
 * serverless function safe to scale: each invocation borrows a connection
 * instead of opening its own against a fixed Postgres limit. Migrations
 * deliberately use the unpooled endpoint instead — see migrate.ts.
 */
let cached: Db | undefined

/*
 * Set when the development branch check fails. Every later getDb() throws it,
 * so a misconfigured dev environment stops rather than degrading quietly.
 */
let wrongBranch: Error | undefined

/**
 * In development, confirm the live branch is the pinned one.
 *
 * Asynchronous because the branch id is a property of the CONNECTION, not of
 * the connection string: the string carries an endpoint id (`ep-…`), the pin
 * is a branch id (`br-…`), and only the database can relate them.
 *
 * That leaves a window. This runs on first use and the queries already in
 * flight do not wait for it, so the honest description is: the first request
 * after boot may touch the wrong database, and every request after that
 * refuses. The synchronous endpoint comparison above is what catches the
 * common case with no window at all.
 *
 * Skipped in production. Vercel's environment is the source of truth there,
 * there is no `.env.production.local` to disagree with it, and a failed check
 * would take the site down over a variable nobody set.
 */
function verifyBranchInDevelopment(connectionString: string): void {
  if (process.env.NODE_ENV === 'production') return

  const pinned = process.env.ATLAS_DB_BRANCH_ID?.trim()
  if (!pinned) {
    wrongBranch = new Error(
      'ATLAS_DB_BRANCH_ID is not set. Every environment must pin the one branch ' +
        'it may write to — see scripts/lib/branch-guard.mjs.',
    )
    return
  }

  void neon(connectionString)`SELECT current_setting('neon.branch_id', true) AS branch`
    .then((rows) => {
      const live = (rows[0] as { branch: string | null } | undefined)?.branch ?? null
      if (live !== null && live !== pinned) {
        wrongBranch = new Error(
          `Connected to branch ${live}, but ATLAS_DB_BRANCH_ID pins this ` +
            `environment to ${pinned}. Refusing further queries.`,
        )
        console.error(wrongBranch.message)
      }
    })
    .catch(() => {
      // A connection failure is not a pin failure. Whatever the query was
      // going to do will report it in its own terms.
    })
}

/*
 * Resolved on first call, not at import. A module-level connection would run
 * during `next build`, when route modules are imported to collect page data —
 * so a build machine without DATABASE_URL would fail to build rather than fail
 * to connect. The env var is checked here, and only here, so the failure names
 * the actual problem.
 */
export function getDb(): Db {
  if (wrongBranch) throw wrongBranch
  if (cached) return cached

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the pooled Neon URL.',
    )
  }

  /*
   * Synchronous, and therefore the check with no window: if the pooled URL the
   * app writes through and the direct URL migrations write through name
   * different endpoints, one of them is stale and nothing should run.
   */
  const mismatch = endpointMismatch(connectionString, process.env.DATABASE_URL_UNPOOLED)
  if (mismatch !== null) throw new Error(mismatchMessage(mismatch))

  cached = drizzle(neon(connectionString), { schema })
  verifyBranchInDevelopment(connectionString)
  return cached
}
