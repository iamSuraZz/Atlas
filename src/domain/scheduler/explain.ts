import type { ClauseKind, Explanation, PriorityTerms, ScoredNode, Weights } from './types'

/*
 * "Why this today". LEARNING_ENGINE.md §4.5.
 *
 * The invariant, enforced by a property test over 7,000 generated nodes: a
 * clause is emitted only when the scoring term it derives from made a non-zero
 * contribution to the priority that selected the node. A sentence about being
 * overdue, on a node whose overdue term contributed nothing, is a
 * plausible-sounding fabrication arrived at without a model's help.
 *
 * That invariant is why this file is a table rather than a sequence of ifs:
 * every clause must name its term, and a clause with no term cannot exist.
 */

const STATE_NAMES = [
  'UNASSESSED',
  'INTRODUCED',
  'DEVELOPING',
  'PRACTICAL',
  'INTERVIEW_READY',
  'MASTERED',
] as const

const stateName = (rank: number) => STATE_NAMES[rank] ?? `level ${rank}`

type ClauseSpec = {
  readonly kind: ClauseKind
  readonly term: keyof PriorityTerms
  readonly weightKey: keyof Weights
  /** Null when the node gives no reason to say this. */
  readonly render: (node: ScoredNode) => string | null
}

/** Order is §4.5's order. The rendered line reads in this sequence. */
const CLAUSES: readonly ClauseSpec[] = [
  {
    kind: 'GAP',
    term: 'gapSize',
    weightKey: 'w1',
    render: (node) => {
      const levels = node.targetRank - node.currentRank
      if (levels <= 0) return null
      return `${levels} level${levels === 1 ? '' : 's'} below your ${stateName(node.targetRank)} target`
    },
  },
  {
    kind: 'OVERDUE',
    term: 'overdueFactor',
    weightKey: 'w2',
    render: (node) =>
      node.daysOverdue !== null && node.daysOverdue > 0
        ? `Last reviewed ${node.daysOverdue}d ago`
        : null,
  },
  {
    kind: 'UNBLOCKS',
    term: 'prerequisiteUnblocking',
    weightKey: 'w5',
    render: (node) => {
      if (node.blockedDescendants <= 0) return null
      const count = `Blocks ${node.blockedDescendants} skill${node.blockedDescendants === 1 ? '' : 's'}`
      return node.topBlockedSkillId === null
        ? count
        : `${count} incl. ${node.topBlockedSkillId}`
    },
  },
  {
    kind: 'ROLE_WEIGHT',
    term: 'roleRelevance',
    weightKey: 'w3',
    render: (node) =>
      node.marketWeight > 0.7 ? `High weight for your target role` : null,
  },
  {
    kind: 'CONFIDENCE',
    term: 'selfRatingDeficit',
    weightKey: 'w8',
    render: (node) =>
      node.lastSelfRating !== null && node.lastSelfRating <= 2
        ? `You rated confidence ${node.lastSelfRating}/5 last time`
        : null,
  },
  {
    kind: 'INTERVIEW',
    term: 'interviewProximity',
    weightKey: 'w4',
    // Reconstructed from the term rather than carried separately, so the
    // sentence and the score cannot disagree about the day count.
    render: (node) => {
      if (node.terms.interviewProximity <= 0) return null
      const days = Math.round(14 - node.terms.interviewProximity * 14)
      return `Interview in ${days}d, weakest category`
    },
  },
]

export function explain(node: ScoredNode): Explanation[] {
  const out: Explanation[] = []

  for (const clause of CLAUSES) {
    const contribution = node.weights[clause.weightKey] * node.terms[clause.term]

    /*
     * The gate. A zero weight means this factor did not influence today's
     * plan; a zero term means the condition is not actually present. Either
     * way the clause would be asserting a reason that did no work.
     */
    if (contribution === 0 || !Number.isFinite(contribution)) continue

    const text = clause.render(node)
    if (text === null) continue

    out.push({
      kind: clause.kind,
      text,
      term: clause.term,
      weightKey: clause.weightKey,
      contribution,
    })
  }

  return out
}

/** The rendered line §4.5 shows, clauses joined by a separator. */
export function explainText(node: ScoredNode, separator = ' · '): string {
  return explain(node)
    .map((clause) => clause.text)
    .join(separator)
}
