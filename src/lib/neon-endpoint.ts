/*
 * Comparing two Neon connection strings. Pure, no imports.
 *
 * A Neon project hands out two URLs per branch: a pooled one whose host
 * carries a `-pooler` suffix, and a direct one without it. The console shows
 * the pooled form by default and the direct form behind a separate toggle, so
 * the two lines of an env file get filled in at different moments — and
 * nothing anywhere checks that they still describe the same database.
 *
 * That is the hole this closes. The branch guard only ever inspected
 * DATABASE_URL_UNPOOLED, while every runtime write in the app goes through the
 * pooled DATABASE_URL. A dev file could name the dev branch in one line and
 * production in the other, and every check would pass.
 */

/** The endpoint host with any pooler suffix removed, lowercased. */
export function endpointHost(connectionString: string): string | null {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return null
  }

  if (url.hostname === '') return null
  return url.hostname.toLowerCase().replace('-pooler.', '.')
}

export type EndpointMismatch = {
  readonly pooled: string
  readonly direct: string
}

/**
 * Null when the two strings resolve to the same endpoint, or when there is
 * nothing to compare. The mismatch itself otherwise.
 *
 * Absence is not a failure here: plenty of contexts set only one of the two.
 * A mismatch is.
 */
export function endpointMismatch(
  pooledUrl: string | undefined,
  directUrl: string | undefined,
): EndpointMismatch | null {
  if (!pooledUrl || !directUrl) return null

  const pooled = endpointHost(pooledUrl)
  const direct = endpointHost(directUrl)
  if (pooled === null || direct === null) return null
  if (pooled === direct) return null

  return { pooled, direct }
}

/** The operator-facing message. Hosts only — a connection string has a password in it. */
export function mismatchMessage(mismatch: EndpointMismatch): string {
  return (
    `DATABASE_URL and DATABASE_URL_UNPOOLED point at different Neon endpoints.\n` +
    `  pooled (the app writes here)      ${mismatch.pooled}\n` +
    `  direct (migrations write here)    ${mismatch.direct}\n` +
    `One of the two lines is stale. Refusing rather than writing to both.`
  )
}
