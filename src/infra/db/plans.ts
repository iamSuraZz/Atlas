import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { getDb } from './client'
import { dailyPlan, mission, skill, type missionFormat } from './schema'

/*
 * Daily plans and their missions.
 *
 * The scheduler decides; this module stores and retrieves. Nothing here ranks,
 * scores or chooses — if a decision is being made in this file it belongs in
 * src/domain/scheduler/ instead.
 */

export type Intensity = 'LIGHT' | 'NORMAL' | 'DEEP'

/*
 * Derived from the enum, not restated.
 *
 * This was a hand-written union until M-DS task a added WATCH, NOTEBOOK,
 * MATH_BY_HAND and VISUALIZE — at which point the column could hold four
 * values this type denied, and every read of it was a lie the compiler had
 * been talked out of noticing. The enum is the single source; a value added
 * there now widens this automatically.
 */
export type MissionFormatName = (typeof missionFormat.enumValues)[number]

export type NewMission = {
  readonly skillId: string
  readonly format: MissionFormatName
  readonly title: string
  readonly brief: string
  readonly why: readonly string[]
  readonly estMinutes: number
  readonly priorityScore: number
  readonly isPrimary: boolean
}

export type NewPlan = {
  readonly userId: string
  /** ISO date, 'YYYY-MM-DD'. A plan belongs to a calendar day, not an instant. */
  readonly planDate: string
  readonly intensity: Intensity
  readonly budgetMinutes: number
  /** The scheduler weights this plan was built with. */
  readonly weights: Record<string, number>
  readonly missions: readonly NewMission[]
}

/**
 * Writes a plan and its missions in two round trips, down from three.
 *
 * It cannot be one. A data-modifying CTE's branches all read the same snapshot,
 * so an INSERT cannot see a DELETE made in the same statement — clearing the
 * old missions and inserting the new ones together leaves both primaries
 * present and trips `one_primary_per_plan`. The index caught it, and the
 * statement is split rather than the index weakened.
 *
 * Statement one upserts the plan and clears its missions; statement two inserts
 * the new set. The upsert also closes a window the old delete-then-insert had:
 * between those two statements the day had no plan at all, and a concurrent
 * read saw an empty TODAY screen.
 */
export async function savePlan(plan: NewPlan): Promise<string> {
  const db = getDb()

  const upserted = await db.execute<{ id: string }>(sql`
    WITH upserted AS (
      INSERT INTO daily_plan (user_id, plan_date, intensity, budget_minutes, weights)
      VALUES (${plan.userId}::uuid, ${plan.planDate}::date, ${plan.intensity},
              ${plan.budgetMinutes}, ${JSON.stringify(plan.weights)}::jsonb)
      ON CONFLICT (user_id, plan_date) DO UPDATE SET
        intensity = EXCLUDED.intensity,
        budget_minutes = EXCLUDED.budget_minutes,
        weights = EXCLUDED.weights,
        generated_at = now()
      RETURNING id
    ), cleared AS (
      DELETE FROM mission WHERE daily_plan_id = (SELECT id FROM upserted)
    )
    SELECT id FROM upserted`)

  const planId = upserted.rows[0]?.id
  if (planId === undefined) throw new Error('daily_plan upsert returned no row')
  if (plan.missions.length === 0) return planId

  await db.insert(mission).values(
    plan.missions.map((m) => ({
      dailyPlanId: planId,
      skillId: m.skillId,
      format: m.format,
      title: m.title,
      brief: m.brief,
      why: [...m.why],
      estMinutes: m.estMinutes,
      // numeric arrives and departs as a string; see mappers.ts.
      priorityScore: m.priorityScore.toFixed(3),
      isPrimary: m.isPrimary,
    })),
  )

  return planId
}

export type StoredPlan = {
  readonly id: string
  readonly planDate: string
  readonly intensity: Intensity
  readonly budgetMinutes: number
  /** The weights as stored. A plan is reproducible from these, not from config. */
  readonly weights: Record<string, number>
  readonly generatedAt: Date
  readonly missions: readonly {
    readonly id: string
    readonly skillId: string
    readonly format: MissionFormatName
    readonly title: string
    readonly brief: string
    readonly why: readonly string[]
    readonly estMinutes: number
    readonly priorityScore: number
    readonly isPrimary: boolean
    readonly status: string
    readonly completedAt: Date | null
    /** 'ENGINEERING' or 'DATA_ML'. TODAY tags each mission with it. */
    readonly track: string
  }[]
}

export async function getPlanForDate(
  userId: string,
  planDate: string,
): Promise<StoredPlan | null> {
  const db = getDb()

  const [plan] = await db
    .select()
    .from(dailyPlan)
    .where(and(eq(dailyPlan.userId, userId), eq(dailyPlan.planDate, planDate)))

  if (!plan) return null

  const missions = await db
    .select({
      id: mission.id,
      skillId: mission.skillId,
      format: mission.format,
      title: mission.title,
      brief: mission.brief,
      why: mission.why,
      estMinutes: mission.estMinutes,
      priorityScore: mission.priorityScore,
      isPrimary: mission.isPrimary,
      status: mission.status,
      completedAt: mission.completedAt,
      // The track comes from the skill, not the mission: a mission is work on
      // a node, and the node is what belongs to a curriculum.
      track: skill.track,
    })
    .from(mission)
    .innerJoin(skill, eq(skill.id, mission.skillId))
    .where(eq(mission.dailyPlanId, plan.id))
    // Hardest first is the scheduler's ordering (§4.2 constraint 3); priority is
    // the stored proxy for it, so a re-read preserves the order it was built in.
    .orderBy(desc(mission.priorityScore))

  return {
    id: plan.id,
    planDate: plan.planDate,
    intensity: plan.intensity as Intensity,
    budgetMinutes: plan.budgetMinutes,
    weights: plan.weights as Record<string, number>,
    generatedAt: plan.generatedAt,
    missions: missions.map((m) => ({
      id: m.id,
      skillId: m.skillId,
      format: m.format,
      title: m.title,
      brief: m.brief,
      why: m.why,
      estMinutes: m.estMinutes,
      priorityScore: Number(m.priorityScore),
      isPrimary: m.isPrimary,
      status: m.status,
      completedAt: m.completedAt,
      track: m.track,
    })),
  }
}

export type RecentFormat = {
  readonly skillId: string
  readonly format: MissionFormatName
  readonly completedAt: Date
}

/**
 * Formats completed per skill inside the lookback window — the input to §4.2
 * constraint 2, "no repeat format on the same node within 72h".
 *
 * `status = 'DONE'` and the descending `completed_at` are not incidental: they
 * are exactly the shape of `mission_skill_recent_idx`, so this stays an index
 * scan as the mission table grows. A mission that was skipped or expired did
 * not consume a format, which is why the partial predicate is correct rather
 * than merely convenient.
 */
export async function recentFormats(
  userId: string,
  since: Date,
): Promise<Map<string, RecentFormat[]>> {
  const rows = await getDb()
    .select({
      skillId: mission.skillId,
      format: mission.format,
      completedAt: mission.completedAt,
    })
    .from(mission)
    .innerJoin(dailyPlan, eq(dailyPlan.id, mission.dailyPlanId))
    .where(
      and(
        eq(dailyPlan.userId, userId),
        eq(mission.status, 'DONE'),
        gte(mission.completedAt, since),
      ),
    )
    .orderBy(mission.skillId, desc(mission.completedAt))

  const bySkill = new Map<string, RecentFormat[]>()

  for (const row of rows) {
    if (row.completedAt === null) continue
    const entry = {
      skillId: row.skillId,
      format: row.format,
      completedAt: row.completedAt,
    }
    const list = bySkill.get(row.skillId)
    if (list === undefined) bySkill.set(row.skillId, [entry])
    else list.push(entry)
  }

  return bySkill
}

/** Marks a mission finished. The only write that sets `completed_at`. */
export async function completeMission(
  missionId: string,
  outcome: {
    actualMinutes: number
    confidence: number | null
    reflection: string | null
  },
): Promise<void> {
  await getDb()
    .update(mission)
    .set({
      status: 'DONE',
      actualMinutes: outcome.actualMinutes,
      confidence: outcome.confidence,
      reflection: outcome.reflection,
      completedAt: sql`now()`,
    })
    .where(eq(mission.id, missionId))
}

/**
 * Marks a mission started. Scoped through daily_plan so a mission id from
 * another account cannot be advanced by guessing it.
 */
export async function startMission(userId: string, missionId: string): Promise<void> {
  const db = getDb()
  const owned = db
    .select({ id: dailyPlan.id })
    .from(dailyPlan)
    .where(eq(dailyPlan.userId, userId))

  await db
    .update(mission)
    .set({ status: 'IN_PROGRESS' })
    .where(and(eq(mission.id, missionId), inArray(mission.dailyPlanId, owned)))
}

export type MissionForUser = {
  readonly id: string
  readonly skillId: string
  readonly format: MissionFormatName
  readonly title: string
  readonly brief: string
  readonly why: readonly string[]
  readonly estMinutes: number
  readonly status: string
  /** MATH_BY_HAND's expected answer, or null. Shape owned by domain/runner. */
  readonly checkSpec: unknown | null
}

/**
 * One mission, scoped to its owner. Every runner action goes through this
 * first: a mission id in a URL is a guess away from someone else's plan.
 */
export async function getMissionForUser(
  userId: string,
  missionId: string,
): Promise<MissionForUser | null> {
  const [row] = await getDb()
    .select({
      id: mission.id,
      skillId: mission.skillId,
      format: mission.format,
      title: mission.title,
      brief: mission.brief,
      why: mission.why,
      estMinutes: mission.estMinutes,
      status: mission.status,
      checkSpec: mission.checkSpec,
    })
    .from(mission)
    .innerJoin(dailyPlan, eq(dailyPlan.id, mission.dailyPlanId))
    .where(and(eq(mission.id, missionId), eq(dailyPlan.userId, userId)))

  return row ?? null
}
