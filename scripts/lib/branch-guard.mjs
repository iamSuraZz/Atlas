/*
 * Refuses to write to a database that is not the one you meant.
 *
 * Every write entrypoint — the migration runner and every seeder — asks this
 * module where it is connected BEFORE its first write, prints the answer, and
 * aborts if the answer disagrees with what the loaded env file claims.
 *
 * The failure this exists to prevent is not malice. It is `npm run db:migrate`
 * at 1am against a shell that still has production values in it, or a
 * .env.production.local that was filled in from the wrong Neon branch. Both
 * are silent today and destructive once. Neither is caught by code review.
 *
 * Three facts are compared, and they come from three different places so that
 * one careless edit cannot move all of them at once:
 *
 *   1. Where we actually are     — current_setting('neon.branch_id'), from the
 *                                  live connection. Cannot be faked by a file.
 *   2. Where the env file claims — ATLAS_DB_ENV and ATLAS_DB_BRANCH_ID.
 *   3. How the command was run   — npm_lifecycle_event, set by npm to the
 *                                  script name. Only a `:prod` script may
 *                                  touch production.
 *
 * On npm_lifecycle_event: it is an ordinary environment variable, so someone
 * who sets it deliberately defeats this. That is not the threat. The threat is
 * doing it by accident, and by accident it is exactly right — npm sets it to
 * the script name, and running a script by hand leaves it unset, which reads
 * as "not a production run" and refuses.
 */
import { neon } from '@neondatabase/serverless'
import { endpointMismatch, mismatchMessage } from '../../src/lib/neon-endpoint.ts'

/** Only a script whose name ends in this may write to the production branch. */
const PROD_SCRIPT_SUFFIX = ':prod'

/**
 * An env var set to the empty string means unset, not "matches nothing".
 * `.env` files carry placeholders as `KEY=""`, and treating that as a value
 * would silently disarm a check that looks armed.
 */
const declared = (name) => {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? null : value.trim()
}

/** Thrown instead of writing. Never caught inside this module. */
export class WrongTargetError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WrongTargetError'
  }
}

/**
 * Reads the connection's own account of itself. One round trip, no writes.
 *
 * `current_setting(..., true)` returns null rather than throwing when the
 * setting is absent, so this also works against a plain Postgres — it just
 * cannot confirm a branch there, which the checks below treat as unverified
 * rather than as safe.
 */
export async function describeTarget(connectionString) {
  const [row] = await neon(connectionString)`
    SELECT current_database()                         AS database,
           current_user                               AS role,
           current_setting('neon.branch_id',   true)  AS branch_id,
           current_setting('neon.endpoint_id', true)  AS endpoint_id,
           current_setting('neon.project_id',  true)  AS project_id`

  return {
    // What the connection says.
    database: row.database,
    role: row.role,
    branchId: row.branch_id,
    endpointId: row.endpoint_id,
    projectId: row.project_id,
    // What the env file claims.
    declaredEnv: declared('ATLAS_DB_ENV'),
    pinnedBranchId: declared('ATLAS_DB_BRANCH_ID'),
    productionBranchId: declared('ATLAS_PROD_BRANCH_ID'),
    // How we were invoked. npm sets this; a bare `node …` leaves it unset.
    invokedAs: declared('npm_lifecycle_event'),
    /*
     * The two connection strings compared. The guard used to look only at the
     * unpooled URL, while every runtime write in the app goes through the
     * pooled one — so an env file could name two different databases and pass.
     */
    endpointMismatch: endpointMismatch(
      process.env.DATABASE_URL,
      process.env.DATABASE_URL_UNPOOLED,
    ),
  }
}

/** True when npm ran us through a script named `…:prod`. */
export function isProdInvocation(target) {
  return target.invokedAs !== null && target.invokedAs.endsWith(PROD_SCRIPT_SUFFIX)
}

/**
 * Every reason this target must not be written to. Empty means safe.
 *
 * Pure — no connection, no environment read — so the whole decision table can
 * be exercised without a database.
 *
 * `kind` separates the two failure families: a `declaration` problem means the
 * env file is lying about where it points and is wrong for reads too; an
 * `intent` problem means the target is real but this command is not allowed to
 * write to it.
 */
export function checkTarget(target) {
  const problems = []
  const prodRun = isProdInvocation(target)
  const ran =
    target.invokedAs === null
      ? 'run directly, outside npm'
      : `npm run ${target.invokedAs}`

  /*
   * A pin is required in EVERY environment, not only on a :prod run. The
   * checks that follow are all conditional on having one, so a blank
   * ATLAS_DB_BRANCH_ID used to disarm the whole module while looking armed —
   * and `--env-file` loses to an ambient shell variable, which is exactly the
   * 1am case this exists for.
   */
  if (target.pinnedBranchId === null) {
    problems.push({
      kind: 'declaration',
      message:
        `No ATLAS_DB_BRANCH_ID is set, so there is nothing to check the live branch ` +
        `against. Every environment must pin the one branch it may write to.`,
    })
  }

  if (target.endpointMismatch !== null) {
    problems.push({
      kind: 'declaration',
      message: mismatchMessage(target.endpointMismatch),
    })
  }

  if (target.pinnedBranchId !== null && target.branchId === null) {
    problems.push({
      kind: 'declaration',
      message:
        `ATLAS_DB_BRANCH_ID pins this env file to ${target.pinnedBranchId}, but the ` +
        `connection reports no neon.branch_id, so the pin cannot be checked. ` +
        `Refusing rather than assuming.`,
    })
  }

  if (
    target.pinnedBranchId !== null &&
    target.branchId !== null &&
    target.branchId !== target.pinnedBranchId
  ) {
    problems.push({
      kind: 'declaration',
      message:
        `Branch mismatch. The env file pins ATLAS_DB_BRANCH_ID=${target.pinnedBranchId}, ` +
        `but this connection is on ${target.branchId}. The connection string and the ` +
        `pin disagree; one of them is stale.`,
    })
  }

  if (prodRun && target.declaredEnv !== 'production') {
    problems.push({
      kind: 'declaration',
      message:
        `${ran} is a production command, but the loaded env file declares ` +
        `ATLAS_DB_ENV=${target.declaredEnv ?? '(unset)'}. Refusing — otherwise this ` +
        `writes somewhere else and reports success, and production stays behind.`,
    })
  }

  if (!prodRun && target.declaredEnv === 'production') {
    problems.push({
      kind: 'intent',
      message:
        `This env file declares ATLAS_DB_ENV=production. Production is writable only ` +
        `through a script whose name ends in "${PROD_SCRIPT_SUFFIX}"; this was ${ran}.`,
    })
  }

  if (
    !prodRun &&
    target.productionBranchId !== null &&
    target.branchId !== null &&
    target.branchId === target.productionBranchId
  ) {
    problems.push({
      kind: 'intent',
      message:
        `This connection is on ${target.branchId}, which ATLAS_PROD_BRANCH_ID names as ` +
        `the production branch, and this was ${ran}. If development and production ` +
        `share one branch, that is the thing to fix — not this check.`,
    })
  }

  return problems
}

/** The header every write entrypoint prints before it writes anything. */
export function formatTarget(target, action) {
  const unknown = '(not reported)'
  const lines = [
    `Target for ${action}:`,
    `  database        ${target.database}`,
    `  role            ${target.role}`,
    `  branch          ${target.branchId ?? unknown}`,
    `  endpoint        ${target.endpointId ?? unknown}`,
    `  project         ${target.projectId ?? unknown}`,
    `  declared env    ${target.declaredEnv ?? '(unset)'}`,
    `  pinned branch   ${target.pinnedBranchId ?? '(unset)'}`,
    `  invoked as      ${target.invokedAs === null ? 'node, outside npm' : `npm run ${target.invokedAs}`}`,
    `  pooled endpoint ${target.endpointMismatch === null ? 'matches the direct one' : `MISMATCH: ${target.endpointMismatch.pooled}`}`,
  ]
  return lines.join('\n')
}

/**
 * The one call a write entrypoint makes. Prints, then either returns the facts
 * or throws without having written anything.
 */
export async function assertWritableTarget(connectionString, action) {
  if (!connectionString) {
    throw new WrongTargetError(
      'DATABASE_URL_UNPOOLED is not set. Writes need the direct, unpooled URL.',
    )
  }

  const target = await describeTarget(connectionString)
  // Printed unconditionally, and before the first write either way: when this
  // refuses, the printout is the evidence of what it refused.
  console.log(formatTarget(target, action))

  const problems = checkTarget(target)
  if (problems.length > 0) {
    throw new WrongTargetError(
      [`Refusing to ${action}.`, ...problems.map((p) => `  - ${p.message}`)].join('\n'),
    )
  }

  return target
}
