import type {
  Candidate,
  PriorityTerms,
  ScoredNode,
  ScoringContext,
  Weights,
} from './types'

/*
 * The priority score. LEARNING_ENGINE.md §4.1.
 *
 * Every term is normalised to roughly 0..1 before weighting, so the weights
 * mean what they look like they mean. Missing inputs resolve to a defined
 * value rather than NaN: a single NaN does not throw, it silently unsorts the
 * whole array.
 */

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Mastery ladder length, from UNASSESSED to MASTERED. */
const LADDER = 5

/**
 * Never practised is not the same as practised today.
 *
 * A node with no review history is treated as one full half-life overdue: it
 * needs attention, but not the 2.0 that a genuinely abandoned node earns.
 * Returning 0 would make all 190 unseeded nodes look perfectly fresh.
 */
const NEVER_PRACTISED_FACTOR = 1

function overdueFactor(candidate: Candidate): number {
  if (candidate.daysOverdue === null) return NEVER_PRACTISED_FACTOR
  if (candidate.halfLifeDays <= 0) return 0
  return clamp(candidate.daysOverdue / candidate.halfLifeDays, 0, 2)
}

/**
 * Non-zero only when a loop is inside 14 days and this category is one of the
 * weak ones — §4.1's "boost when a loop is within 14 days and this category is
 * weak". Rises as the loop approaches.
 */
function interviewProximity(candidate: Candidate, ctx: ScoringContext): number {
  const days = ctx.daysToInterview
  if (days === null || days > 14 || days < 0) return 0
  if (!ctx.weakestCategories.includes(candidate.category)) return 0
  return (14 - days) / 14
}

/**
 * Minutes on this node in the last 72h, normalised against a full session.
 * Three hours on one node in three days is saturation; the term caps there.
 */
const SATURATION_MINUTES = 180

/**
 * §4.5 emitted a clause about a low self-rating that §4.1 never scored. Rather
 * than delete the clause, the score gained this term: a rating of 1 means you
 * told the system you could not do it, which is information the ranking should
 * not throw away. Confident ratings contribute nothing rather than subtracting
 * — a 5 is not a reason to avoid a node, just not a reason to choose it.
 */
function selfRatingDeficit(candidate: Candidate): number {
  if (candidate.lastSelfRating === null) return 0
  return clamp((3 - candidate.lastSelfRating) / 2, 0, 1)
}

function termsFor(candidate: Candidate, ctx: ScoringContext): PriorityTerms {
  const gap = Math.max(0, candidate.targetRank - candidate.currentRank) / LADDER

  return {
    gapSize: clamp(gap, 0, 1),
    overdueFactor: overdueFactor(candidate),
    roleRelevance: clamp(candidate.marketWeight, 0, 1),
    interviewProximity: interviewProximity(candidate, ctx),
    prerequisiteUnblocking:
      ctx.maxBlockedDescendants <= 0
        ? 0
        : clamp(candidate.blockedDescendants / ctx.maxBlockedDescendants, 0, 1),
    recentSaturation: clamp(candidate.minutesSpentLast72h / SATURATION_MINUTES, 0, 1),
    estimatedCost:
      candidate.estimatedMinutesToNextLevel === null || ctx.maxMinutesToNextLevel <= 0
        ? 0
        : clamp(candidate.estimatedMinutesToNextLevel / ctx.maxMinutesToNextLevel, 0, 1),
    selfRatingDeficit: selfRatingDeficit(candidate),
  }
}

export function scorePriority(
  candidate: Candidate,
  ctx: ScoringContext,
  weights: Weights,
): ScoredNode {
  const terms = termsFor(candidate, ctx)

  /*
   * Signed, never clamped at zero. A node that is finished, saturated and
   * expensive should rank below one that is merely unremarkable, and clamping
   * would make those indistinguishable. Display rounds it; the score does not.
   */
  const priority =
    weights.w1 * terms.gapSize +
    weights.w2 * terms.overdueFactor +
    weights.w3 * terms.roleRelevance +
    weights.w4 * terms.interviewProximity +
    weights.w5 * terms.prerequisiteUnblocking +
    weights.w8 * terms.selfRatingDeficit -
    weights.w6 * terms.recentSaturation -
    weights.w7 * terms.estimatedCost

  return { ...candidate, priority, terms, weights }
}

/**
 * A deterministic tie-break seeded from the plan date.
 *
 * On a cold start six of the seven original terms are constant across every
 * node, so hundreds of candidates tie exactly. Sorting by id would pin the
 * alphabetically luckiest nodes to the top forever; random would break the
 * reproducibility §4.1 promises. Hashing (skillId, date) gives a stable order
 * within a day and a different one tomorrow.
 */
function tieBreak(skillId: string, now: Date): number {
  const day = Math.floor(now.getTime() / 86_400_000)
  let hash = 0x811c9dc5 ^ day

  for (let i = 0; i < skillId.length; i++) {
    hash ^= skillId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash >>> 0
}

export function rankCandidates(
  candidates: readonly Candidate[],
  ctx: ScoringContext,
  weights: Weights,
): ScoredNode[] {
  return candidates
    .map((candidate) => scorePriority(candidate, ctx, weights))
    .sort((a, b) => {
      // Tolerance, not equality: two paths to the same score can differ in the
      // last bits of a float and that is not a real difference in priority.
      if (Math.abs(a.priority - b.priority) > 1e-9) return b.priority - a.priority
      return tieBreak(a.skillId, ctx.now) - tieBreak(b.skillId, ctx.now)
    })
}
