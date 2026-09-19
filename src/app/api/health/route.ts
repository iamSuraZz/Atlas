/*
 * Liveness only: is this process running and able to answer? It touches nothing
 * else on purpose — a liveness probe that depends on the database reports a
 * database outage as a dead application, and the platform restarts a process
 * that was never broken. Reachability is /api/health/deep.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json(
    { status: 'ok', check: 'liveness' },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}
