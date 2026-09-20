import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import {
  evidenceSkill,
  masteryTransition,
  skill,
  skillPrerequisite,
  skillState,
} from './schema'

/*
 * Read access to the skill graph for the SKILLS screen.
 *
 * Every function here is read-only. Writes to skill_state go through the
 * mastery gate and nowhere else (DATABASE_DESIGN.md §4.5), so this module
 * deliberately exports no mutation.
 */

export type MasteryStateName =
  | 'UNASSESSED'
  | 'INTRODUCED'
  | 'DEVELOPING'
  | 'PRACTICAL'
  | 'INTERVIEW_READY'
  | 'MASTERED'

export type SkillRow = {
  readonly id: string
  readonly name: string
  readonly category: string
  /** Null when no skill_state row exists yet — the node has never been touched. */
  readonly state: MasteryStateName | null
  readonly lastPractised: Date | null
  readonly nextReview: Date | null
  readonly objectiveEvidenceCount: number
}

/**
 * Every node with its state, left-joined so a skill with no state row still
 * appears. A node you have never touched is exactly the kind the weak list
 * needs to surface.
 */
export async function listSkillRows(userId: string): Promise<SkillRow[]> {
  const rows = await getDb()
    .select({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      state: skillState.state,
      lastPractised: skillState.lastPractised,
      nextReview: skillState.nextReview,
      objectiveEvidenceCount: sql<number>`(
        SELECT count(*)::int FROM ${evidenceSkill}
        WHERE ${evidenceSkill.skillId} = ${skill.id} AND ${evidenceSkill.objective}
      )`,
    })
    .from(skill)
    .leftJoin(
      skillState,
      and(eq(skillState.skillId, skill.id), eq(skillState.userId, userId)),
    )
    .orderBy(asc(skill.id))

  return rows.map((row) => ({ ...row, state: row.state as MasteryStateName | null }))
}

export type SkillDetail = {
  readonly skill: {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly category: string
    readonly decay: string
  }
  readonly state: MasteryStateName | null
  readonly lastPractised: Date | null
  readonly nextReview: Date | null
  readonly prerequisites: readonly {
    readonly id: string
    readonly state: MasteryStateName | null
  }[]
  readonly transitions: readonly {
    readonly fromState: string
    readonly toState: string
    readonly reason: string
    readonly automatic: boolean
    readonly createdAt: Date
  }[]
}

export async function getSkillDetail(
  userId: string,
  skillId: string,
): Promise<SkillDetail | null> {
  const db = getDb()

  const [node] = await db
    .select({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      decay: skill.decay,
      state: skillState.state,
      lastPractised: skillState.lastPractised,
      nextReview: skillState.nextReview,
    })
    .from(skill)
    .leftJoin(
      skillState,
      and(eq(skillState.skillId, skill.id), eq(skillState.userId, userId)),
    )
    .where(eq(skill.id, skillId))

  if (!node) return null

  const prerequisites = await db
    .select({ id: skillPrerequisite.requiresId, state: skillState.state })
    .from(skillPrerequisite)
    .leftJoin(
      skillState,
      and(
        eq(skillState.skillId, skillPrerequisite.requiresId),
        eq(skillState.userId, userId),
      ),
    )
    .where(eq(skillPrerequisite.skillId, skillId))
    .orderBy(asc(skillPrerequisite.requiresId))

  // Append-only audit. Newest first, because the last move is the interesting one.
  const transitions = await db
    .select({
      fromState: masteryTransition.fromState,
      toState: masteryTransition.toState,
      reason: masteryTransition.reason,
      automatic: masteryTransition.automatic,
      createdAt: masteryTransition.createdAt,
    })
    .from(masteryTransition)
    .where(
      and(eq(masteryTransition.skillId, skillId), eq(masteryTransition.userId, userId)),
    )
    .orderBy(sql`${masteryTransition.createdAt} DESC`)

  return {
    skill: {
      id: node.id,
      name: node.name,
      description: node.description,
      category: node.category,
      decay: node.decay,
    },
    state: node.state as MasteryStateName | null,
    lastPractised: node.lastPractised,
    nextReview: node.nextReview,
    prerequisites: prerequisites.map((p) => ({
      id: p.id,
      state: p.state as MasteryStateName | null,
    })),
    transitions,
  }
}
