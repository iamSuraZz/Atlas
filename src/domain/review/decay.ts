/*
 * Decay. Model is docs/LEARNING_ENGINE.md §3.2.
 *
 * Two thresholds, both measured from the last *successful* attempt:
 *   1x half-life — the node enters the review queue
 *   2x half-life — the node drops one mastery level
 *
 * A demotion is a scheduling fact, not a verdict. §3.2 is explicit that it is
 * surfaced quietly in the weekly review rather than announced, which is why
 * this function returns a plain assessment and decides nothing about tone.
 *
 * Pure: no clock, no database. `now` is an argument so a two-half-life
 * threshold can be tested without waiting a year for one.
 */

export type DecayClass = 'PROCEDURAL_DAILY' | 'CONCEPTUAL' | 'RECALL_HEAVY' | 'NARRATIVE'

/** Half-life in days, from the table in §3.2. */
export const HALF_LIFE_DAYS = {
  // Used at work, so it degrades slowly.
  PROCEDURAL_DAILY: 180,
  // Understood once, re-derived slowly.
  CONCEPTUAL: 90,
  // Pure recall: patterns and framework answers go first.
  RECALL_HEAVY: 45,
  // Project stories. The facts stay; the telling goes stale.
  NARRATIVE: 120,
} as const satisfies Record<DecayClass, number>

const DAY_MS = 86_400_000

export type DecayInput = {
  readonly now: Date
  /** Null when the node has never been practised successfully. */
  readonly lastSuccessAt: Date | null
  readonly decay: DecayClass
}

export type DecayAssessment = {
  /** Null when there has never been a success to measure from. */
  readonly daysSinceSuccess: number | null
  readonly dueForReview: boolean
  readonly shouldDemote: boolean
  readonly halfLifeDays: number
}

export function assessDecay({ now, lastSuccessAt, decay }: DecayInput): DecayAssessment {
  const halfLifeDays = HALF_LIFE_DAYS[decay]

  /*
   * Never practised: worth surfacing, but there is no earned level to take
   * away. Demotion applies to something you demonstrated and then lost.
   */
  if (lastSuccessAt === null) {
    return {
      daysSinceSuccess: null,
      dueForReview: true,
      shouldDemote: false,
      halfLifeDays,
    }
  }

  const daysSinceSuccess = (now.getTime() - lastSuccessAt.getTime()) / DAY_MS

  return {
    daysSinceSuccess,
    dueForReview: daysSinceSuccess >= halfLifeDays,
    /*
     * NARRATIVE "drifts rather than decays" (§3.2): a project story needs
     * re-rehearsing, not re-learning, so it is queued but never demoted.
     */
    shouldDemote: decay !== 'NARRATIVE' && daysSinceSuccess >= halfLifeDays * 2,
    halfLifeDays,
  }
}
