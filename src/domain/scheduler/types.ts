/*
 * Scheduler types. LEARNING_ENGINE.md §4.
 *
 * Pure: no framework, no database, no AI SDK, no clock. Every input arrives as
 * an argument, including `now`, which is what makes a 72h lookback or a 2x
 * half-life demotion testable without waiting for one.
 */

export type Intensity = 'LIGHT' | 'NORMAL' | 'DEEP'

export type Thread = 'DSA' | 'SYSTEM_DESIGN' | 'COMMUNICATION' | 'REVIEW' | 'THEME'

export type MissionFormat =
  | 'EXPLAIN'
  | 'BUILD'
  | 'DEBUG'
  | 'READ_CODE'
  | 'QUERY'
  | 'DESIGN'
  | 'DEFEND'
  | 'TEACH'
  | 'REVIEW'
  | 'INTERVIEW'
  | 'APPLY_TO_PROJECT'

/**
 * Weights from §4.1, as amended.
 *
 * w8 exists because §4.5 emitted a clause about self-rating that §4.1 never
 * scored — the explanation was citing a reason that had no part in the
 * decision. Adding the term was the fix; deleting the clause was the
 * alternative. w1 and w2 were reduced to make room.
 */
export type Weights = {
  /** gap_size */ w1: number
  /** overdue_factor */ w2: number
  /** role_relevance */ w3: number
  /** interview_proximity */ w4: number
  /** prerequisite_unblocking */ w5: number
  /** recent_saturation, subtracted */ w6: number
  /** estimated_cost, subtracted */ w7: number
  /** self_rating_deficit */ w8: number
}

export const DEFAULT_WEIGHTS: Weights = {
  w1: 0.27,
  w2: 0.23,
  w3: 0.15,
  w4: 0.1,
  /*
   * Kept at 0.10 despite being thin today: 137 of 190 seeded nodes unblock
   * nothing and the rest split into three tiers. It is retained because on a
   * cold start it is the only term with any variance — the other six are
   * constant across every node — and because it gains resolution as the
   * prerequisite graph grows, while the others gain resolution only through
   * use. Revisit past ~150 edges.
   */
  w5: 0.1,
  w6: 0.07,
  w7: 0.03,
  w8: 0.08,
}

export type RecentFormat = { readonly format: MissionFormat; readonly at: Date }

export type Candidate = {
  readonly skillId: string
  readonly category: string
  /** Index into the mastery ladder, 0 = UNASSESSED. */
  readonly currentRank: number
  readonly targetRank: number
  readonly halfLifeDays: number
  /** Null when the node has never been practised — not the same as zero. */
  readonly daysOverdue: number | null
  readonly marketWeight: number
  readonly blockedDescendants: number
  readonly minutesSpentLast72h: number
  readonly estimatedMinutesToNextLevel: number | null
  /** 1–5. A prior, never a score. Null when never rated. */
  readonly lastSelfRating: number | null
  readonly topBlockedSkillId: string | null
  readonly recentFormats: readonly RecentFormat[]
}

export type ScoringContext = {
  readonly now: Date
  readonly daysToInterview: number | null
  readonly weakestCategories: readonly string[]
  /*
   * Fixed normalisation bases, deliberately not the maximum of the candidate
   * set: §4.1 requires a plan to be reproducible, and normalising against
   * whoever else happened to be a candidate makes the same node score
   * differently on different days.
   */
  readonly maxBlockedDescendants: number
  readonly maxMinutesToNextLevel: number
}

export type PriorityTerms = {
  gapSize: number
  overdueFactor: number
  roleRelevance: number
  interviewProximity: number
  prerequisiteUnblocking: number
  recentSaturation: number
  estimatedCost: number
  selfRatingDeficit: number
}

export type ScoredNode = Candidate & {
  readonly priority: number
  readonly terms: PriorityTerms
  /*
   * The weights this node was scored with travel with it, so explain() cannot
   * be handed a different set than the one that produced the ranking.
   */
  readonly weights: Weights
}

export type ClauseKind =
  'GAP' | 'OVERDUE' | 'UNBLOCKS' | 'ROLE_WEIGHT' | 'CONFIDENCE' | 'INTERVIEW'

export type Explanation = {
  readonly kind: ClauseKind
  readonly text: string
  readonly term: keyof PriorityTerms
  readonly weightKey: keyof Weights
  /** weight x term. The real contribution, not a decoration. */
  readonly contribution: number
}

export type Mission = {
  readonly id: string
  readonly skillId: string
  readonly thread: Thread
  readonly format: MissionFormat
  readonly minutes: number
  readonly difficulty: number
  readonly primary: boolean
  readonly priority: number
  readonly why: readonly string[]
}

/**
 * A proposed demotion. §4.4 says decay is applied silently after a long
 * absence; the scheduler is pure, so it proposes and the mastery gate writes.
 */
export type DecayDecision = {
  readonly skillId: string
  readonly demote: boolean
  readonly reason: string
}

export type Plan = {
  readonly intensity: Intensity
  readonly budgetMinutes: number
  readonly primary: Mission
  readonly items: readonly Mission[]
  readonly weightsUsed: Weights
  readonly generatedFor: Date
  readonly decayDecisions: readonly DecayDecision[]
}
// No `deferred`, `backlog` or `carriedOver`, and no count of anything missed.
// §4.4: nothing grows while you are away, and a field a screen can render is a
// field a screen eventually renders.

export type PlanInput = {
  readonly now: Date
  readonly intensity: Intensity
  readonly budgetMinutes: number
  readonly candidates: readonly Candidate[]
  readonly threadQuotas: readonly { thread: Thread; share: number }[]
  readonly daysMissed: number
  readonly weights: Weights
  readonly context: ScoringContext
}

export type ReentryShape = {
  readonly budgetMinutes: number
  readonly reviews: number
  readonly missions: number
}
