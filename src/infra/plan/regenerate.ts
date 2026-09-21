import { buildPlan, budgetFor, DEFAULT_WEIGHTS, PHASE_1_QUOTAS } from '@/domain/scheduler'
import { loadCandidates } from '@/infra/db/candidates'
import { applyDecayDecisions } from '@/infra/db/mastery'
import { savePlan, type Intensity } from '@/infra/db/plans'

/*
 * The one place plan generation is composed: load candidates, call the pure
 * scheduler, store the result.
 *
 * No decision is made here. Ranking, constraints, budget and explanation all
 * live in src/domain/scheduler/, which is why this file is short enough to read
 * in one go.
 */

/*
 * Quotas now come from the domain: DATA_ML_TRACK.md §3.2 replaced the four
 * placeholder shares that used to live here, and adding the Data & ML thread
 * without them would have left the new track 0% of every week.
 */
const THREAD_QUOTAS = PHASE_1_QUOTAS

const MS_PER_DAY = 86_400_000

export async function regenerateTodayPlan(
  userId: string,
  intensity: Intensity,
  now: Date,
  options: { lastActiveOn?: Date | null } = {},
): Promise<void> {
  const { candidates, lastActiveOn, activePhases } = await loadCandidates(userId, now)
  const budget = budgetFor(intensity)

  /*
   * The last day that had a plan, from the candidate query. Without it
   * daysMissed was permanently 0 and §4.4's rules — smaller plans, the
   * ten-minute re-entry, decay — could never fire.
   */
  const lastActive = options.lastActiveOn ?? lastActiveOn
  const daysMissed =
    lastActive === null
      ? 0
      : Math.max(0, Math.floor((now.getTime() - lastActive.getTime()) / MS_PER_DAY) - 1)

  const plan = buildPlan({
    now,
    intensity,
    // Mid-range: the band's floor would under-fill a day the user asked for.
    budgetMinutes: Math.round((budget.min + budget.max) / 2),
    candidates,
    threadQuotas: THREAD_QUOTAS,
    activePhases,
    daysMissed,
    weights: DEFAULT_WEIGHTS,
    context: {
      now,
      // No interview scheduling and no weakness model yet — both are M3.
      daysToInterview: null,
      weakestCategories: [],
      /*
       * Fixed bases, not the candidate set's maximum: a plan must be
       * reproducible, and a per-set maximum makes the same node score
       * differently depending on who else was a candidate that day.
       */
      maxBlockedDescendants: 10,
      maxMinutesToNextLevel: 600,
    },
  })

  await savePlan({
    userId,
    planDate: now.toISOString().slice(0, 10),
    intensity,
    budgetMinutes: plan.budgetMinutes,
    // Stored per plan so tuning a weight later cannot rewrite this day's reasoning.
    weights: plan.weightsUsed as unknown as Record<string, number>,
    missions: plan.items.map((m) => ({
      skillId: m.skillId,
      format: m.format,
      title: `${m.format}: ${m.skillId}`,
      brief: '',
      why: m.why,
      estMinutes: m.minutes,
      priorityScore: m.priority,
      isPrimary: m.primary,
    })),
  })

  /*
   * §4.4 applies decay silently after a long absence. buildPlan proposed the
   * demotions; the gate performs them, so the state change and its audit row
   * are written together and neither can exist without the other.
   *
   * After the plan, not before: a demotion that lands mid-generation would make
   * the plan describe states that no longer hold.
   */
  await applyDecayDecisions(userId, plan.decayDecisions)
}
