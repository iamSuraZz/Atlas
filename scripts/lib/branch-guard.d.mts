/*
 * Types for branch-guard.mjs.
 *
 * The guard is plain JavaScript because two of its three callers are .mjs
 * scripts, and this file is what lets the third — src/infra/db/migrate.ts —
 * import it under `allowJs: false`. Hand-written on purpose: this is a module
 * boundary, and the project states those explicitly rather than inferring them.
 */

/** What the live connection and the loaded env file each say about the target. */
export type Target = {
  /** From the connection. */
  readonly database: string
  readonly role: string
  /** null when the endpoint is not Neon, or reports no branch. */
  readonly branchId: string | null
  readonly endpointId: string | null
  readonly projectId: string | null
  /** From the env file: ATLAS_DB_ENV, e.g. 'development' | 'production'. */
  readonly declaredEnv: string | null
  /** From the env file: the one branch this file is permitted to touch. */
  readonly pinnedBranchId: string | null
  /** From the env file: the branch that must never be written to casually. */
  readonly productionBranchId: string | null
  /** npm's script name, or null when run outside npm. */
  readonly invokedAs: string | null
  /** Set when DATABASE_URL and DATABASE_URL_UNPOOLED name different endpoints. */
  readonly endpointMismatch: { readonly pooled: string; readonly direct: string } | null
}

export type Problem = {
  /** `declaration`: the env file is wrong. `intent`: this command may not write here. */
  readonly kind: 'declaration' | 'intent'
  readonly message: string
}

export declare class WrongTargetError extends Error {}

export declare function describeTarget(connectionString: string): Promise<Target>
export declare function isProdInvocation(target: Target): boolean
export declare function checkTarget(target: Target): Problem[]
export declare function formatTarget(target: Target, action: string): string

/**
 * Prints the target, then returns it or throws `WrongTargetError`. Throws
 * before the caller has written anything.
 */
export declare function assertWritableTarget(
  connectionString: string | undefined,
  action: string,
): Promise<Target>
