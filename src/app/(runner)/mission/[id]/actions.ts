'use server'

import { headers } from 'next/headers'
import {
  evidenceDraftFor,
  objectivePassedFor,
  validateSubmission,
  type NumericCheck,
  type Submission,
} from '@/domain/runner/formats'
import { getAuth } from '@/infra/auth/server'
import { recordAttempt } from '@/infra/db/attempts'
import { recordEvidence } from '@/infra/db/evidence'
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

/**
 * Completion for the four Data & ML formats. M-DS task c.
 *
 * What each format requires, whether it produced an objective result, and what
 * evidence it leaves are all decided in src/domain/runner/formats.ts — this
 * function authenticates, checks ownership, and writes. No rule lives here.
 *
 * Nothing in this app executes Python. Colab and Kaggle do that already, for
 * free, with GPUs; NOTEBOOK takes the URL of work done there.
 */
export async function submitDataMlMission(input: {
  missionId: string
  submission: Submission
  durationSeconds: number
  reflection: Reflection
}): Promise<{
  ok: boolean
  message?: string
  errors?: readonly string[]
  /** The verdict the server computed and stored. Never recomputed client-side. */
  objectivePassed?: boolean | null
}> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  const mission = await getMissionForUser(session.user.id, input.missionId)
  if (!mission) return { ok: false, message: 'Mission not found.' }

  const validation = validateSubmission(input.submission)
  if (!validation.ok) return { ok: false, errors: validation.errors }

  if (input.reflection.confidence < 1 || input.reflection.confidence > 5) {
    return { ok: false, message: 'Confidence must be between 1 and 5.' }
  }

  const check = numericCheckFrom(mission.checkSpec)
  const objectivePassed = objectivePassedFor(input.submission, check)

  await recordAttempt({
    userId: session.user.id,
    missionId: input.missionId,
    skillId: mission.skillId,
    response: describe(input.submission),
    // The submission itself is the objective record: the URL, the metrics, the
    // answer. Storing it verbatim is what makes the attempt auditable later.
    objectiveResult: input.submission,
    objectivePassed,
    durationSeconds: input.durationSeconds,
    aiAssisted: false,
  })

  const draft = evidenceDraftFor(input.submission)
  if (draft !== null) {
    await recordEvidence({
      userId: session.user.id,
      skillId: mission.skillId,
      kind: draft.kind,
      classification: draft.classification,
      title: draft.title,
      occurredOn: new Date().toISOString().slice(0, 10),
      rawBody: draft.rawBody,
      metricValue: draft.metricValue,
      metricUnit: draft.metricUnit,
      metricSource: draft.metricSource,
      artifactUrl: draft.artifactUrl,
      // The PRACTICAL gate reads exactly this: a result with no baseline is
      // not an objective artifact (§4.2 rule 5).
      objective: objectivePassed === true,
    })
  }

  await completeMission(input.missionId, {
    actualMinutes: Math.max(1, Math.round(input.durationSeconds / 60)),
    confidence: input.reflection.confidence,
    reflection: input.reflection.note,
  })

  return { ok: true, objectivePassed }
}

/**
 * The worked answer, released only after an attempt has been recorded.
 *
 * A separate call rather than part of the mission payload: the page is a
 * server component, so anything it sends reaches the browser before the user
 * has answered. Shipping the answer with the question and hiding it in CSS
 * would be theatre.
 */
export async function revealWorkedAnswer(
  missionId: string,
): Promise<{ worked: string; expected: number; unit: string | null } | null> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  const mission = await getMissionForUser(session.user.id, missionId)
  if (!mission || mission.status !== 'DONE') return null

  const check = numericCheckFrom(mission.checkSpec)
  if (check === null) return null

  return { worked: check.worked, expected: check.expected, unit: check.unit }
}

/**
 * Reads a `mission.check_spec` row into a NumericCheck, or null.
 *
 * Defensive because the column is jsonb: it holds whatever was written, and
 * nothing authors these yet. A malformed spec yields null — "not checked" —
 * rather than a crash or, worse, a comparison against `undefined` that marks
 * every answer wrong.
 */
function numericCheckFrom(value: unknown): NumericCheck | null {
  if (typeof value !== 'object' || value === null) return null
  const spec = value as Record<string, unknown>

  if (typeof spec['expected'] !== 'number' || !Number.isFinite(spec['expected']))
    return null
  if (typeof spec['tolerance'] !== 'number' || !Number.isFinite(spec['tolerance']))
    return null
  if (spec['tolerance'] < 0) return null

  return {
    expected: spec['expected'],
    tolerance: spec['tolerance'],
    unit: typeof spec['unit'] === 'string' ? spec['unit'] : null,
    worked: typeof spec['worked'] === 'string' ? spec['worked'] : '',
  }
}

/** A human-readable record of what was submitted, for `attempt.response`. */
function describe(submission: Submission): string {
  switch (submission.kind) {
    case 'WATCH':
      return submission.recall.trim()
    case 'NOTEBOOK':
      return [
        submission.url,
        `Result: ${submission.result.value} ${submission.result.unit}`,
        submission.baseline === null
          ? 'Baseline: none'
          : `Baseline: ${submission.baseline.value} ${submission.baseline.unit}`,
        '',
        submission.validity.trim(),
      ].join('\n')
    case 'MATH_BY_HAND':
      return submission.working.trim() === ''
        ? String(submission.answer)
        : `${submission.answer}\n\n${submission.working.trim()}`
    case 'VISUALIZE':
      return [
        submission.url,
        `Shows: ${submission.shows.trim()}`,
        `A worse chart would hide: ${submission.hides.trim()}`,
      ].join('\n')
  }
}
