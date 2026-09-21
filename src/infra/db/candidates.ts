import { and, eq, sql } from 'drizzle-orm'
import { HALF_LIFE_DAYS, type DecayClass } from '@/domain/review/decay'
import { MASTERY_ORDER, type MasteryState } from '@/domain/skills/mastery'
import type { Candidate, MissionFormat } from '@/domain/scheduler'
import { getDb } from './client'
import {
  activePhase,
  dailyPlan,
  mission,
  skill,
  skillPrerequisite,
  skillState,
} from './schema'

/*
 * Assembles the scheduler's input from the database, in one round trip.
 *
 * The scheduler is pure and takes everything as arguments, so this is where the
 * joins live. Keeping them here rather than inside buildPlan is what lets 161
 * unit tests run in under a second with nothing started.
 *
 * Every derived value is a correlated subquery rather than a separate query: at
 * 300ms of latency, sequencing costs more than the work does.
 */

const rankOf = (state: string): number => {
  const index = MASTERY_ORDER.indexOf(state as MasteryState)
  return index === -1 ? 0 : index
}

const MS_72H = 72 * 60 * 60 * 1000

type RecentFormatJson = { format: string; at: string }

export type CandidateLoad = {
  readonly candidates: Candidate[]
  /** Most recent day that has a plan. Null when there has never been one. */
  readonly lastActiveOn: Date | null
  /** The phases the user is working through. Empty means nothing is active. */
  readonly activePhases: string[]
}

export async function loadCandidates(userId: string, now: Date): Promise<CandidateLoad> {
  const since = new Date(now.getTime() - MS_72H)

  const rows = await getDb()
    .select({
      skillId: skill.id,
      // A node's own id when it is a topic, its parent's when it is a leaf.
      topic: sql<string>`COALESCE(${skill.parentId}, ${skill.id})`,
      category: skill.category,
      phase: skill.phase,
      decay: skill.decay,
      marketWeight: skill.marketWeight,
      hoursToPractical: skill.hoursToPractical,
      state: skillState.state,
      targetState: skillState.targetState,
      nextReview: skillState.nextReview,
      selfRating: skillState.selfRating,

      blockedDescendants: sql<number>`(
        SELECT count(*)::int FROM ${skillPrerequisite}
        WHERE ${skillPrerequisite.requiresId} = ${skill.id}
      )`,

      topBlockedSkillId: sql<string | null>`(
        SELECT ${skillPrerequisite.skillId} FROM ${skillPrerequisite}
        WHERE ${skillPrerequisite.requiresId} = ${skill.id}
        ORDER BY ${skillPrerequisite.skillId} LIMIT 1
      )`,

      // Minutes on this node in the last 72h — §4.1's recent_saturation.
      minutesSpentLast72h: sql<number>`COALESCE((
        SELECT sum(${mission.actualMinutes})::int FROM ${mission}
        JOIN ${dailyPlan} ON ${dailyPlan.id} = ${mission.dailyPlanId}
        WHERE ${mission.skillId} = ${skill.id}
          AND ${dailyPlan.userId} = ${userId}
          AND ${mission.completedAt} >= ${since}
      ), 0)`,

      /*
       * The 72h format lookback, folded in here rather than fetched by a second
       * query. Same predicate mission_skill_recent_idx serves — status DONE,
       * skill, recent — so it stays an index scan, and it saves a round trip.
       */
      recentFormats: sql<RecentFormatJson[]>`COALESCE((
        SELECT json_agg(json_build_object(
          'format', ${mission.format},
          'at', ${mission.completedAt}
        ))
        FROM ${mission}
        JOIN ${dailyPlan} ON ${dailyPlan.id} = ${mission.dailyPlanId}
        WHERE ${mission.skillId} = ${skill.id}
          AND ${dailyPlan.userId} = ${userId}
          AND ${mission.status} = 'DONE'
          AND ${mission.completedAt} >= ${since}
      ), '[]'::json)`,

      /*
       * Carried on every row so §4.4's missed-day rules have an input without
       * a second round trip. Constant per query; read once from the first row.
       */
      lastActiveOn: sql<string | null>`(
        SELECT max(${dailyPlan.planDate}) FROM ${dailyPlan}
        WHERE ${dailyPlan.userId} = ${userId} AND ${dailyPlan.planDate} < ${now.toISOString().slice(0, 10)}
      )`,

      /*
       * The active phases, also carried on every row and also constant per
       * query. THEME and DATA_ML draw only from these, so without it every
       * phase-gated thread would be empty — and a separate query for four
       * short strings is a round trip this cannot afford.
       */
      activePhases: sql<string[]>`COALESCE((
        SELECT json_agg(${activePhase.phase})
        FROM ${activePhase} WHERE ${activePhase.userId} = ${userId}
      ), '[]'::json)`,
    })
    .from(skill)
    .leftJoin(
      skillState,
      and(eq(skillState.skillId, skill.id), eq(skillState.userId, userId)),
    )

  const lastActive = rows[0]?.lastActiveOn ?? null

  const candidates = rows.map((row) => ({
    skillId: row.skillId,
    topic: row.topic,
    category: row.category,
    phase: row.phase,
    currentRank: rankOf(row.state ?? 'UNASSESSED'),
    targetRank: rankOf(row.targetState ?? 'PRACTICAL'),
    halfLifeDays: HALF_LIFE_DAYS[row.decay as DecayClass],
    /*
     * Null when there is no scheduled review yet — never practised, which the
     * scheduler treats differently from practised-today. Negative means not yet
     * due, so it floors at zero.
     */
    daysOverdue:
      row.nextReview === null
        ? null
        : Math.max(0, (now.getTime() - row.nextReview.getTime()) / 86_400_000),
    marketWeight: Number(row.marketWeight),
    blockedDescendants: row.blockedDescendants,
    minutesSpentLast72h: row.minutesSpentLast72h,
    // NULL for every seeded node today: no source produces an estimate.
    estimatedMinutesToNextLevel:
      row.hoursToPractical === null ? null : Number(row.hoursToPractical) * 60,
    lastSelfRating: row.selfRating,
    topBlockedSkillId: row.topBlockedSkillId,
    recentFormats: row.recentFormats.map((entry) => ({
      format: entry.format as MissionFormat,
      at: new Date(entry.at),
    })),
  }))

  return {
    candidates,
    lastActiveOn: lastActive === null ? null : new Date(`${lastActive}T00:00:00Z`),
    activePhases: rows[0]?.activePhases ?? [],
  }
}
