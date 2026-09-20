import { getDb } from './client'
import { attempt } from './schema'

/*
 * Attempt records. Append-only by convention: an attempt is what happened,
 * and editing history is how a learning record stops being evidence.
 */

export type NewAttempt = {
  readonly userId: string
  readonly missionId: string | null
  readonly skillId: string
  readonly response: string
  /** Authoritative where present. Null when the format admits no objective check. */
  readonly objectiveResult: unknown | null
  readonly objectivePassed: boolean | null
  readonly durationSeconds: number | null
  readonly aiAssisted: boolean
}

export async function recordAttempt(row: NewAttempt): Promise<string> {
  const [created] = await getDb()
    .insert(attempt)
    .values({
      userId: row.userId,
      missionId: row.missionId,
      skillId: row.skillId,
      response: row.response,
      objectiveResult: row.objectiveResult,
      objectivePassed: row.objectivePassed,
      durationSeconds: row.durationSeconds,
      aiAssisted: row.aiAssisted,
    })
    .returning({ id: attempt.id })

  if (!created) throw new Error('attempt insert returned no row')
  return created.id
}
