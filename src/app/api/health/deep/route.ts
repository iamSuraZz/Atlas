import { pingDatabase } from '@/infra/db/health'

/*
 * Readiness: can this deployment actually reach Neon? Never prerendered and
 * never cached — a health check served from a cache reports the past.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const database = await pingDatabase()

  /*
   * 503 when the database is unreachable, not 200 with a warning in the body.
   * A monitor reads the status code; a check that always returns 200 is a check
   * that never fires.
   */
  return Response.json(
    {
      status: database.reachable ? 'ok' : 'error',
      check: 'readiness',
      database,
    },
    {
      status: database.reachable ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
