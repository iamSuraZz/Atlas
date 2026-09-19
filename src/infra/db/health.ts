import { sql } from 'drizzle-orm'
import { getDb } from './client'

export type DbPing =
  | { readonly reachable: true; readonly latencyMs: number }
  | { readonly reachable: false; readonly error: string }

/*
 * A connection string can appear inside driver errors. This endpoint is
 * unauthenticated, so the message is scrubbed before it ever reaches a
 * response body.
 */
function redact(message: string): string {
  return message.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '<connection string redacted>')
}

/*
 * Drizzle wraps driver failures, so the outermost message is only ever
 * "Failed query: select 1", which tells an operator nothing actionable. The
 * real reason — DNS failure, refused connection, bad password — sits further
 * down the cause chain, so the chain is flattened into a single line.
 */
function describe(error: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    const message = current.message
      .replace(/\s*params:\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (message !== '' && !parts.includes(message)) parts.push(message)
    current = current.cause
  }

  return redact(parts.length > 0 ? parts.join(' <- ') : String(error))
}

/**
 * Round-trips a trivial query. `select 1` deliberately touches no table, so the
 * check reports connectivity rather than the state of any particular schema.
 */
export async function pingDatabase(timeoutMs = 5000): Promise<DbPing> {
  const startedAt = performance.now()

  try {
    /*
     * A database that accepts the connection but never answers would otherwise
     * hang the health check until the platform's own timeout, which reports as
     * a dead deployment rather than a slow database.
     */
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`no response within ${timeoutMs}ms`)), timeoutMs),
    )

    await Promise.race([getDb().execute(sql`select 1`), timeout])

    return { reachable: true, latencyMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    return { reachable: false, error: describe(error) }
  }
}
