import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
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
 * Resolved on first call, not at import. A module-level connection would run
 * during `next build`, when route modules are imported to collect page data —
 * so a build machine without DATABASE_URL would fail to build rather than fail
 * to connect. The env var is checked here, and only here, so the failure names
 * the actual problem.
 */
export function getDb(): Db {
  if (cached) return cached

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the pooled Neon URL.',
    )
  }

  cached = drizzle(neon(connectionString), { schema })
  return cached
}
