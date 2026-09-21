import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { getDb } from './client'
import { ALL_PHASES } from '@/lib/phases'
import { activePhase, buildProject, buildProjectProgress } from './schema'

export { ALL_PHASES } from '@/lib/phases'
export type { Phase } from '@/lib/phases'

/*
 * Active phases and the build ladder. M-DS task d.
 *
 * Two small read/write surfaces that did not fit the existing repositories:
 * `active_phase` is user configuration the scheduler reads, and the ladder is
 * reference data with one user-owned fact attached to it.
 */

const PHASE_SET: ReadonlySet<string> = new Set(ALL_PHASES)

export async function listActivePhases(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ phase: activePhase.phase })
    .from(activePhase)
    .where(eq(activePhase.userId, userId))
    .orderBy(asc(activePhase.phase))

  return rows.map((row) => row.phase)
}

/**
 * Replaces the active set.
 *
 * Unknown phase ids are rejected rather than inserted: the CHECK on the table
 * only enforces the SHAPE `^[ED][0-9]{1,2}$`, so 'D99' would pass it and then
 * quietly match no skill at all — an active phase that silently does nothing
 * is worse than an error.
 *
 * Two statements, not three. The delete is scoped to phases leaving the set,
 * so a phase that stays active keeps its original `activated_at` — that date
 * is the only record of when a phase opened.
 */
export async function setActivePhases(userId: string, phases: string[]): Promise<void> {
  const unknown = phases.filter((phase) => !PHASE_SET.has(phase))
  if (unknown.length > 0) {
    throw new Error(`Unknown phase: ${unknown.join(', ')}`)
  }

  const db = getDb()
  const wanted = [...new Set(phases)]

  if (wanted.length === 0) {
    await db.delete(activePhase).where(eq(activePhase.userId, userId))
    return
  }

  /*
   * notInArray, not a hand-written `<> ALL(...)`. Drizzle's sql template
   * expands a JS array into a parameter LIST, so `ALL(${wanted}::text[])`
   * became `ALL($1, $2, $3::text[])` — a syntax error that surfaced as a
   * silently failed toggle rather than anything that looked like a bug.
   */
  await db
    .delete(activePhase)
    .where(and(eq(activePhase.userId, userId), notInArray(activePhase.phase, wanted)))

  await db
    .insert(activePhase)
    .values(wanted.map((phase) => ({ userId, phase })))
    .onConflictDoNothing()
}

export type LadderProject = {
  readonly id: string
  readonly sequence: number
  readonly name: string
  readonly level: string
  readonly phase: string
  readonly dataSource: string
  readonly proves: string
  readonly estHoursMin: number
  readonly estHoursMax: number
  readonly brief: string
  readonly artifactUrl: string | null
  readonly completedAt: Date | null
  /** True for the lowest-sequence project that is not finished. */
  readonly current: boolean
}

/**
 * The fifteen projects in ladder order, with your progress against each.
 *
 * "Current" is the lowest-sequence unfinished project, not the one whose phase
 * is active. §6 is a ladder: P9 feeds P13 feeds P15, and skipping a rung
 * because its phase happens to be open would break the chain it was built as.
 */
export async function listLadder(userId: string): Promise<LadderProject[]> {
  const rows = await getDb()
    .select({
      id: buildProject.id,
      sequence: buildProject.sequence,
      name: buildProject.name,
      level: buildProject.level,
      phase: buildProject.phase,
      dataSource: buildProject.dataSource,
      proves: buildProject.proves,
      estHoursMin: buildProject.estHoursMin,
      estHoursMax: buildProject.estHoursMax,
      brief: buildProject.brief,
      artifactUrl: buildProjectProgress.artifactUrl,
      completedAt: buildProjectProgress.completedAt,
    })
    .from(buildProject)
    .leftJoin(
      buildProjectProgress,
      and(
        eq(buildProjectProgress.projectId, buildProject.id),
        eq(buildProjectProgress.userId, userId),
      ),
    )
    .orderBy(asc(buildProject.sequence))

  const currentIndex = rows.findIndex((row) => row.completedAt === null)

  return rows.map((row, index) => ({ ...row, current: index === currentIndex }))
}

/**
 * Marks a project finished. The URL is required here AND by a CHECK on the
 * table, because §6 is explicit: a project with no public artifact does not
 * count.
 */
export async function completeProject(
  userId: string,
  projectId: string,
  artifactUrl: string,
  note: string | null,
): Promise<void> {
  const url = artifactUrl.trim()
  if (url === '') throw new Error('A project needs a public artifact URL to count.')

  await getDb()
    .insert(buildProjectProgress)
    .values({ userId, projectId, artifactUrl: url, note })
    .onConflictDoUpdate({
      target: [buildProjectProgress.userId, buildProjectProgress.projectId],
      set: { artifactUrl: url, note },
    })
}

/** Undoes a completion. Nothing else in the app deletes a progress row. */
export async function reopenProject(userId: string, projectId: string): Promise<void> {
  await getDb()
    .delete(buildProjectProgress)
    .where(
      and(
        eq(buildProjectProgress.userId, userId),
        eq(buildProjectProgress.projectId, projectId),
      ),
    )
}

/** Skills the ladder touches, for the PROJECTS screen. */
export async function skillsForProjects(
  projectIds: string[],
): Promise<Map<string, string[]>> {
  if (projectIds.length === 0) return new Map()

  const rows = await getDb()
    .select({
      projectId: sql<string>`bps.project_id`,
      skillId: sql<string>`bps.skill_id`,
    })
    .from(sql`build_project_skill AS bps`)
    .where(inArray(sql`bps.project_id`, projectIds))
    .orderBy(sql`bps.project_id, bps.skill_id`)

  const bySkill = new Map<string, string[]>()
  for (const row of rows) {
    const list = bySkill.get(row.projectId)
    if (list === undefined) bySkill.set(row.projectId, [row.skillId])
    else list.push(row.skillId)
  }
  return bySkill
}
