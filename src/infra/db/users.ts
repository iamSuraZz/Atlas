import { count } from 'drizzle-orm'
import { getDb } from './client'
import { appUser } from './schema'

/*
 * Repository access to app_user. Query construction lives here because the
 * boundary rule confines drizzle-orm to src/infra/db/ — callers get a number,
 * not a query builder.
 */
export async function countUsers(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(appUser)
  // noUncheckedIndexedAccess: an aggregate always returns a row, but the type
  // system cannot know that.
  return row?.n ?? 0
}
