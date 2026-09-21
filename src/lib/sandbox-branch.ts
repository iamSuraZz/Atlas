/*
 * Which Neon branches the sandbox is permitted to delete. Pure, no imports.
 *
 * This rule governs the only code in the application that can destroy a
 * database (ADR-018's `dropSandbox`), so it lives here rather than beside the
 * fetch calls: `src/infra/sandbox/neon-branch.ts` is `server-only` and cannot
 * be imported by a test, and an unrunnable rule is not a control.
 */

/** The only branch names the sandbox may delete. */
export const SANDBOX_PREFIX = 'mission-'

export type BranchPins = {
  readonly development: string | null
  readonly production: string | null
}

/**
 * The reason this branch must not be deleted, or null.
 *
 * `name` is null when the API did not return one. That is refused rather than
 * allowed: a branch we know nothing about is not the same as a branch that is
 * safe to drop.
 */
export function deletionRefusal(
  branchId: string,
  name: string | null,
  pins: BranchPins,
): string | null {
  if (
    (pins.development !== null && branchId === pins.development) ||
    (pins.production !== null && branchId === pins.production)
  ) {
    return `Refusing to delete ${branchId}: it is a pinned branch, not a sandbox.`
  }

  if (name === null || !name.startsWith(SANDBOX_PREFIX)) {
    return (
      `Refusing to delete branch ${branchId}: its name ${JSON.stringify(name)} does ` +
      `not start with "${SANDBOX_PREFIX}", so it is not a mission sandbox.`
    )
  }

  return null
}
