'use server'

import { headers } from 'next/headers'
import { getAuth } from '@/infra/auth/server'
import { recordAttempt } from '@/infra/db/attempts'
import { completeMission, getMissionForUser } from '@/infra/db/plans'
import {
  createSandbox,
  dropSandbox,
  runInSandbox,
  SandboxUnavailableError,
  type QueryOutcome,
} from '@/infra/sandbox/neon-branch'

export type RunResult =
  | { readonly kind: 'ran'; readonly outcome: QueryOutcome }
  | { readonly kind: 'unavailable'; readonly message: string }

/**
 * Runs one QUERY statement in a disposable branch, then drops it.
 *
 * Branch per run rather than per session: a session that is abandoned mid-way
 * never reaches a cleanup path, and an orphaned branch costs more than the
 * copy-on-write create it saves.
 */
export async function runQuery(missionId: string, statement: string): Promise<RunResult> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { kind: 'unavailable', message: 'Not signed in.' }

  // Ownership check before anything is created.
  const mission = await getMissionForUser(session.user.id, missionId)
  if (!mission) return { kind: 'unavailable', message: 'Mission not found.' }

  let sandbox = null

  try {
    sandbox = await createSandbox(missionId)
    return { kind: 'ran', outcome: await runInSandbox(sandbox, statement) }
  } catch (error) {
    if (error instanceof SandboxUnavailableError) {
      return { kind: 'unavailable', message: error.message }
    }
    throw error
  } finally {
    if (sandbox !== null) await dropSandbox(sandbox.branchId)
  }
}

export type Reflection = {
  /** 1–5. A prior for the scheduler, never a score (DATABASE_DESIGN §2). */
  readonly confidence: number
  readonly note: string | null
}

/**
 * Completion. Writes the attempt and the reflection together.
 *
 * §3.2: "a 5-second reflection: confidence 1–5, one optional line". Short by
 * design — a reflection that takes a minute is a reflection that gets skipped,
 * and a skipped one feeds the scheduler nothing.
 */
export async function submitMission(input: {
  missionId: string
  response: string
  durationSeconds: number
  objectiveResult: QueryOutcome | null
  reflection: Reflection
}): Promise<{ ok: boolean; message?: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  const mission = await getMissionForUser(session.user.id, input.missionId)
  if (!mission) return { ok: false, message: 'Mission not found.' }

  if (input.reflection.confidence < 1 || input.reflection.confidence > 5) {
    return { ok: false, message: 'Confidence must be between 1 and 5.' }
  }

  await recordAttempt({
    userId: session.user.id,
    missionId: input.missionId,
    skillId: mission.skillId,
    response: input.response,
    objectiveResult: input.objectiveResult,
    /*
     * Null for EXPLAIN and REVIEW: neither admits an objective check until the
     * AI gateway exists in M3, and null is what §3.1's PRACTICAL gate reads as
     * "no objective artifact" — which is the honest answer, not a failure.
     */
    objectivePassed: input.objectiveResult === null ? null : input.objectiveResult.ok,
    durationSeconds: input.durationSeconds,
    aiAssisted: false,
  })

  await completeMission(input.missionId, {
    actualMinutes: Math.max(1, Math.round(input.durationSeconds / 60)),
    confidence: input.reflection.confidence,
    reflection: input.reflection.note,
  })

  return { ok: true }
}
