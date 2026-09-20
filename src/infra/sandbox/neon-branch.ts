import 'server-only'

/*
 * Disposable SQL sandbox for QUERY missions. ADR-018: "a Neon branch per
 * session, restricted role, dropped after."
 *
 * A branch rather than a container because Vercel has no containers, and a
 * branch rather than a shared schema because a QUERY mission should be able to
 * DROP something and have that be fine. Branch creation is copy-on-write, so
 * the cost of a throwaway copy of the whole database is close to nothing —
 * which is the property that makes this design work at all.
 *
 * Requires NEON_API_KEY and NEON_PROJECT_ID. Neither is in .env.example's
 * required set today, so this fails with a named error rather than silently
 * running missions against the real database.
 */

const NEON_API = 'https://console.neon.tech/api/v2'

export class SandboxUnavailableError extends Error {
  constructor(reason: string) {
    super(`SQL sandbox unavailable: ${reason}`)
    this.name = 'SandboxUnavailableError'
  }
}

export type Sandbox = {
  readonly branchId: string
  readonly connectionString: string
}

function credentials(): { apiKey: string; projectId: string } {
  const apiKey = process.env.NEON_API_KEY
  const projectId = process.env.NEON_PROJECT_ID

  if (!apiKey || !projectId) {
    throw new SandboxUnavailableError(
      'NEON_API_KEY and NEON_PROJECT_ID are not set. QUERY missions need a ' +
        'disposable branch (ADR-018); running them against the primary branch ' +
        'is not an acceptable substitute.',
    )
  }

  return { apiKey, projectId }
}

async function neonApi(path: string, init: RequestInit): Promise<unknown> {
  const { apiKey } = credentials()

  const response = await fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    // The body can echo connection details, so only the status is surfaced.
    throw new SandboxUnavailableError(`Neon API returned ${response.status} for ${path}`)
  }

  return response.json()
}

/**
 * Creates a throwaway branch for one mission session.
 *
 * The branch is named with the mission id so an orphan is traceable to the
 * session that leaked it — `dropSandbox` is best-effort, and a process that
 * dies mid-mission will leave one behind.
 */
export async function createSandbox(missionId: string): Promise<Sandbox> {
  const { projectId } = credentials()

  const created = (await neonApi(`/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: { name: `mission-${missionId}` },
      endpoints: [{ type: 'read_write' }],
    }),
  })) as {
    branch: { id: string }
    connection_uris?: { connection_uri: string }[]
  }

  const uri = created.connection_uris?.[0]?.connection_uri
  if (uri === undefined) {
    // Do not fall through to any other connection: a sandbox that is silently
    // the real database is worse than no sandbox.
    await dropSandbox(created.branch.id)
    throw new SandboxUnavailableError('Neon returned a branch with no connection URI')
  }

  return { branchId: created.branch.id, connectionString: uri }
}

/** Drops the branch. Safe to call twice; a missing branch is not an error here. */
export async function dropSandbox(branchId: string): Promise<void> {
  const { projectId } = credentials()

  try {
    await neonApi(`/projects/${projectId}/branches/${branchId}`, { method: 'DELETE' })
  } catch {
    /*
     * Swallowed deliberately. This runs in a finally block; throwing here would
     * replace a real mission error with a cleanup error and lose the original.
     * An orphaned branch is visible in the Neon console and named for its
     * mission.
     */
  }
}

export type QueryOutcome =
  | {
      readonly ok: true
      readonly columns: string[]
      readonly rows: unknown[][]
      readonly ms: number
    }
  | { readonly ok: false; readonly error: string; readonly ms: number }

/**
 * Runs one statement in a sandbox and returns what happened.
 *
 * The result is the objective evaluation for a QUERY mission — §3.1's
 * "query returns correct result against a real DB". It is recorded verbatim on
 * the attempt, because a claim that a query worked is worth nothing without
 * the rows it returned.
 */
export async function runInSandbox(
  sandbox: Sandbox,
  statement: string,
): Promise<QueryOutcome> {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(sandbox.connectionString)
  const startedAt = performance.now()

  try {
    const rows = (await sql.query(statement)) as Record<string, unknown>[]
    const columns = rows[0] ? Object.keys(rows[0]) : []

    return {
      ok: true,
      columns,
      rows: rows.map((row) => columns.map((c) => row[c])),
      ms: Math.round(performance.now() - startedAt),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ms: Math.round(performance.now() - startedAt),
    }
  }
}
