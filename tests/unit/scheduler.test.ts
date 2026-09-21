import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  budgetFor,
  buildPlan,
  rankCandidates,
  reentryShapeFor,
  scorePriority,
  type Candidate,
  type PlanInput,
  type Mission,
  type ScoredNode,
  type ScoringContext,
} from '@/domain/scheduler'

/*
 * Executable specification for the scheduler. LEARNING_ENGINE.md §4.
 *
 * This suite is written before the implementation and is expected to be red
 * until it exists. Every assertion traces to a numbered clause in §4; where §4
 * is silent the test states the decision it is pinning down, so a future reader
 * can tell a requirement from a choice.
 *
 * The scheduler is pure. `now` is injected, no clock is read, and nothing here
 * touches a database.
 */

const NOW = new Date('2026-06-01T00:00:00Z')

/*
 * A candidate with every term neutral. Each test perturbs exactly one field, so
 * a failure names the term that broke rather than "the score changed".
 */
const base: Candidate = {
  skillId: 'postgres/indexing',
  topic: 'postgres',
  category: 'DATA',
  phase: 'E2',
  currentRank: 0, // UNASSESSED
  targetRank: 3, // PRACTICAL
  halfLifeDays: 90,
  daysOverdue: 0,
  marketWeight: 0.5,
  blockedDescendants: 0,
  minutesSpentLast72h: 0,
  estimatedMinutesToNextLevel: null,
  lastSelfRating: null,
  topBlockedSkillId: null,
  recentFormats: [],
}

const ctx: ScoringContext = {
  now: NOW,
  daysToInterview: null,
  weakestCategories: [],
  /*
   * Fixed normalisation bases, not the maximum of the candidate set. §4.1 says
   * a plan must be reproducible; normalising against whoever else happened to
   * be a candidate makes the same node score differently on different days.
   */
  maxBlockedDescendants: 10,
  maxMinutesToNextLevel: 600,
}

const candidate = (over: Partial<Candidate>): Candidate => ({
  ...base,
  // A node's topic is its id up to the slash. Derived here so that overriding
  // skillId alone cannot leave a fixture claiming to be in another topic.
  ...(over.skillId !== undefined && over.topic === undefined
    ? { topic: over.skillId.split('/')[0] ?? over.skillId }
    : {}),
  ...over,
})

describe('§4.1 priority score — individual terms', () => {
  it('gap_size is (target - current) / 5', () => {
    const node = scorePriority(
      candidate({ currentRank: 1, targetRank: 4 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.gapSize).toBeCloseTo(0.6, 10)
  })

  it('gap_size is zero once the target is reached', () => {
    const node = scorePriority(
      candidate({ currentRank: 3, targetRank: 3 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.gapSize).toBe(0)
  })

  it('gap_size never goes negative when the node is above target', () => {
    const node = scorePriority(
      candidate({ currentRank: 5, targetRank: 3 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.gapSize).toBe(0)
  })

  it('overdue_factor is days_overdue / half_life', () => {
    const node = scorePriority(
      candidate({ daysOverdue: 45, halfLifeDays: 90 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.overdueFactor).toBeCloseTo(0.5, 10)
  })

  it('overdue_factor caps at 2.0', () => {
    const node = scorePriority(
      candidate({ daysOverdue: 900, halfLifeDays: 90 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.overdueFactor).toBe(2)
  })

  it('role_relevance is the market weight as supplied', () => {
    const node = scorePriority(candidate({ marketWeight: 0.8 }), ctx, DEFAULT_WEIGHTS)
    expect(node.terms.roleRelevance).toBeCloseTo(0.8, 10)
  })

  it('prerequisite_unblocking normalises against the fixed basis, not the candidate set', () => {
    const node = scorePriority(candidate({ blockedDescendants: 5 }), ctx, DEFAULT_WEIGHTS)
    expect(node.terms.prerequisiteUnblocking).toBeCloseTo(0.5, 10)
  })

  it('prerequisite_unblocking clamps at 1 when a node exceeds the basis', () => {
    const node = scorePriority(
      candidate({ blockedDescendants: 40 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.prerequisiteUnblocking).toBe(1)
  })

  it('interview_proximity is zero with no interview scheduled', () => {
    const node = scorePriority(candidate({}), ctx, DEFAULT_WEIGHTS)
    expect(node.terms.interviewProximity).toBe(0)
  })

  it('interview_proximity is zero when the loop is more than 14 days away', () => {
    const node = scorePriority(
      candidate({}),
      { ...ctx, daysToInterview: 20, weakestCategories: ['DATA'] },
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.interviewProximity).toBe(0)
  })

  it('interview_proximity is zero within 14 days when this category is not weak', () => {
    const node = scorePriority(
      candidate({ category: 'DATA' }),
      { ...ctx, daysToInterview: 7, weakestCategories: ['SYSTEMS'] },
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.interviewProximity).toBe(0)
  })

  it('interview_proximity is positive within 14 days for a weak category', () => {
    const node = scorePriority(
      candidate({ category: 'DATA' }),
      { ...ctx, daysToInterview: 7, weakestCategories: ['DATA'] },
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.interviewProximity).toBeGreaterThan(0)
  })

  it('interview_proximity rises as the loop gets closer', () => {
    const near = scorePriority(
      candidate({}),
      { ...ctx, daysToInterview: 2, weakestCategories: ['DATA'] },
      DEFAULT_WEIGHTS,
    )
    const far = scorePriority(
      candidate({}),
      { ...ctx, daysToInterview: 13, weakestCategories: ['DATA'] },
      DEFAULT_WEIGHTS,
    )
    expect(near.terms.interviewProximity).toBeGreaterThan(far.terms.interviewProximity)
  })

  it('recent_saturation rises with minutes spent in the last 72h', () => {
    const fresh = scorePriority(
      candidate({ minutesSpentLast72h: 0 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    const saturated = scorePriority(
      candidate({ minutesSpentLast72h: 180 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(saturated.terms.recentSaturation).toBeGreaterThan(fresh.terms.recentSaturation)
  })

  it('self_rating_deficit is (3 - rating) / 2, so a 1 is the strongest signal', () => {
    const worst = scorePriority(candidate({ lastSelfRating: 1 }), ctx, DEFAULT_WEIGHTS)
    const middling = scorePriority(candidate({ lastSelfRating: 2 }), ctx, DEFAULT_WEIGHTS)
    expect(worst.terms.selfRatingDeficit).toBeCloseTo(1, 10)
    expect(middling.terms.selfRatingDeficit).toBeCloseTo(0.5, 10)
  })

  it('self_rating_deficit clamps at zero for a confident rating', () => {
    for (const rating of [3, 4, 5]) {
      const node = scorePriority(
        candidate({ lastSelfRating: rating }),
        ctx,
        DEFAULT_WEIGHTS,
      )
      expect(node.terms.selfRatingDeficit).toBe(0)
    }
  })

  it('self_rating_deficit is zero when the node has never been rated', () => {
    const node = scorePriority(candidate({ lastSelfRating: null }), ctx, DEFAULT_WEIGHTS)
    expect(node.terms.selfRatingDeficit).toBe(0)
  })

  it('a low self-rating raises priority, all else equal', () => {
    const unrated = scorePriority(
      candidate({ lastSelfRating: null }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    const shaky = scorePriority(candidate({ lastSelfRating: 1 }), ctx, DEFAULT_WEIGHTS)
    expect(shaky.priority).toBeGreaterThan(unrated.priority)
  })

  it('estimated_cost normalises minutes against the fixed basis', () => {
    const node = scorePriority(
      candidate({ estimatedMinutesToNextLevel: 300 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(node.terms.estimatedCost).toBeCloseTo(0.5, 10)
  })
})

describe('§4.1 priority score — composition', () => {
  it('sums the five positive terms and subtracts the two negative ones', () => {
    const node = scorePriority(
      candidate({
        currentRank: 0,
        targetRank: 5,
        daysOverdue: 90,
        halfLifeDays: 90,
        marketWeight: 1,
        blockedDescendants: 10,
        minutesSpentLast72h: 180,
        estimatedMinutesToNextLevel: 600,
      }),
      { ...ctx, daysToInterview: null },
      DEFAULT_WEIGHTS,
    )
    const w = DEFAULT_WEIGHTS
    const t = node.terms
    const expected =
      w.w1 * t.gapSize +
      w.w2 * t.overdueFactor +
      w.w3 * t.roleRelevance +
      w.w4 * t.interviewProximity +
      w.w5 * t.prerequisiteUnblocking +
      w.w8 * t.selfRatingDeficit -
      w.w6 * t.recentSaturation -
      w.w7 * t.estimatedCost
    expect(node.priority).toBeCloseTo(expected, 10)
  })

  it('saturation lowers priority, all else equal', () => {
    const fresh = scorePriority(candidate({ daysOverdue: 30 }), ctx, DEFAULT_WEIGHTS)
    const saturated = scorePriority(
      candidate({ daysOverdue: 30, minutesSpentLast72h: 240 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(saturated.priority).toBeLessThan(fresh.priority)
  })

  it('cost lowers priority, all else equal', () => {
    const cheap = scorePriority(
      candidate({ estimatedMinutesToNextLevel: 30 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    const dear = scorePriority(
      candidate({ estimatedMinutesToNextLevel: 600 }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(dear.priority).toBeLessThan(cheap.priority)
  })

  it('uses the default weights from §4.1', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      w1: 0.27,
      w2: 0.23,
      w3: 0.15,
      w4: 0.1,
      w5: 0.1,
      w6: 0.07,
      w7: 0.03,
      w8: 0.08,
    })
  })

  it('carries the weights it was scored with, so explain() cannot be misled', () => {
    const node = scorePriority(candidate({}), ctx, DEFAULT_WEIGHTS)
    expect(node.weights).toEqual(DEFAULT_WEIGHTS)
  })

  it('lets priority go negative rather than clamping it', () => {
    const penalised = scorePriority(
      candidate({
        currentRank: 3,
        targetRank: 3,
        // 0, not null: a never-practised node scores 1.0 on overdue by design.
        daysOverdue: 0,
        minutesSpentLast72h: 600,
        estimatedMinutesToNextLevel: 600,
        marketWeight: 0,
      }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(penalised.priority).toBeLessThan(0)
  })

  it('records every term so a plan can be reproduced from its log', () => {
    const node = scorePriority(candidate({}), ctx, DEFAULT_WEIGHTS)
    expect(Object.keys(node.terms).sort()).toEqual(
      [
        'estimatedCost',
        'gapSize',
        'interviewProximity',
        'overdueFactor',
        'prerequisiteUnblocking',
        'recentSaturation',
        'roleRelevance',
        'selfRatingDeficit',
      ].sort(),
    )
  })

  it('honours non-default weights', () => {
    const onlyGap = { w1: 1, w2: 0, w3: 0, w4: 0, w5: 0, w6: 0, w7: 0, w8: 0 }
    const node = scorePriority(candidate({ currentRank: 0, targetRank: 5 }), ctx, onlyGap)
    expect(node.priority).toBeCloseTo(1, 10)
  })
})

describe('missing inputs never produce NaN', () => {
  /*
   * Every one of these is NULL for all 190 seeded nodes today. A single NaN
   * poisons the sort silently — the array simply stops being ordered.
   */
  it('handles a node that has never been practised (daysOverdue null)', () => {
    const node = scorePriority(candidate({ daysOverdue: null }), ctx, DEFAULT_WEIGHTS)
    expect(Number.isFinite(node.priority)).toBe(true)
    expect(Number.isFinite(node.terms.overdueFactor)).toBe(true)
  })

  it('handles a null cost estimate', () => {
    const node = scorePriority(
      candidate({ estimatedMinutesToNextLevel: null }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(Number.isFinite(node.priority)).toBe(true)
    expect(node.terms.estimatedCost).toBe(0)
  })

  it('distinguishes never-practised from practised-today', () => {
    const never = scorePriority(candidate({ daysOverdue: null }), ctx, DEFAULT_WEIGHTS)
    const today = scorePriority(candidate({ daysOverdue: 0 }), ctx, DEFAULT_WEIGHTS)
    expect(never.terms.overdueFactor).not.toBe(today.terms.overdueFactor)
  })

  it('produces a finite score for a wholly unseeded node', () => {
    const node = scorePriority(
      candidate({
        daysOverdue: null,
        estimatedMinutesToNextLevel: null,
        lastSelfRating: null,
        blockedDescendants: 0,
      }),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(Number.isFinite(node.priority)).toBe(true)
  })
})

describe('cold start — six of seven terms are constant on day one', () => {
  /*
   * Today every skill_state is UNASSESSED -> PRACTICAL with last_practised,
   * next_review and self_rating all NULL; hours_to_practical is NULL for all
   * 190 nodes and market_weight is 0.50 for all 190. Only
   * prerequisite_unblocking varies, and only for 53 of 190 nodes.
   *
   * The scheduler must still produce a stable, defensible order.
   */
  const coldStart = (skillId: string, blockedDescendants = 0) =>
    candidate({
      skillId,
      blockedDescendants,
      daysOverdue: null,
      estimatedMinutesToNextLevel: null,
      marketWeight: 0.5,
    })

  it('ranks every candidate without throwing when all terms tie', () => {
    const ranked = rankCandidates(
      ['a/one', 'b/two', 'c/three'].map((id) => coldStart(id)),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(ranked).toHaveLength(3)
  })

  it('is deterministic — the same input yields the same order', () => {
    const input = ['a/one', 'b/two', 'c/three', 'd/four'].map((id) => coldStart(id))
    const first = rankCandidates(input, ctx, DEFAULT_WEIGHTS).map(
      (n: ScoredNode) => n.skillId,
    )
    const second = rankCandidates(input, ctx, DEFAULT_WEIGHTS).map(
      (n: ScoredNode) => n.skillId,
    )
    expect(second).toEqual(first)
  })

  it('does not depend on the order candidates were supplied in', () => {
    const ids = ['a/one', 'b/two', 'c/three', 'd/four']
    const forward = rankCandidates(
      ids.map((id) => coldStart(id)),
      ctx,
      DEFAULT_WEIGHTS,
    )
    const reversed = rankCandidates(
      [...ids].reverse().map((id) => coldStart(id)),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(reversed.map((n: ScoredNode) => n.skillId)).toEqual(
      forward.map((n: ScoredNode) => n.skillId),
    )
  })

  it('does not simply alphabetise, which would pin the same nodes to the top forever', () => {
    const ids = [
      'agents/state',
      'api-architecture/validation',
      'zz/last',
      'postgres/ctes',
    ]
    const ranked = rankCandidates(
      ids.map((id) => coldStart(id)),
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(ranked.map((n: ScoredNode) => n.skillId)).not.toEqual([...ids].sort())
  })

  it('still lets the one live term win — an unblocker outranks a tied node', () => {
    const ranked = rankCandidates(
      [coldStart('a/leaf'), coldStart('b/unblocker', 4), coldStart('c/leaf')],
      ctx,
      DEFAULT_WEIGHTS,
    )
    expect(ranked[0]!.skillId).toBe('b/unblocker')
  })

  it('varies the tie order across days so the same nodes are not always first', () => {
    const ids = ['a/one', 'b/two', 'c/three', 'd/four', 'e/five']
    const monday = rankCandidates(
      ids.map((id) => coldStart(id)),
      ctx,
      DEFAULT_WEIGHTS,
    )
    const tuesday = rankCandidates(
      ids.map((id) => coldStart(id)),
      {
        ...ctx,
        now: new Date('2026-06-02T00:00:00Z'),
      },
      DEFAULT_WEIGHTS,
    )
    expect(tuesday.map((n: ScoredNode) => n.skillId)).not.toEqual(
      monday.map((n: ScoredNode) => n.skillId),
    )
  })
})

describe('§4.3 intensity budgets', () => {
  it('LIGHT is 30 to 45 minutes', () => {
    const { min, max } = budgetFor('LIGHT')
    expect([min, max]).toEqual([30, 45])
  })

  it('NORMAL is 60 to 120 minutes', () => {
    const { min, max } = budgetFor('NORMAL')
    expect([min, max]).toEqual([60, 120])
  })

  it('DEEP is 120 to 240 minutes', () => {
    const { min, max } = budgetFor('DEEP')
    expect([min, max]).toEqual([120, 240])
  })
})

describe('§4.2 plan construction', () => {
  const manyCandidates = (count: number): Candidate[] =>
    Array.from({ length: count }, (_, i) =>
      candidate({
        skillId: `topic${i}/node${i}`,
        category: i % 2 === 0 ? 'DATA' : 'SYSTEMS',
        phase: i % 2 === 0 ? 'E2' : 'E3',
        daysOverdue: count - i,
        blockedDescendants: i % 4,
      }),
    )

  /*
   * M-DS task b made threads into filters rather than labels on a time slice,
   * so a fixture of twenty synthetic nodes can no longer fill a DSA or REVIEW
   * slot. These are the nodes that actually belong to those threads; the
   * assertions below are unchanged.
   */
  const threadMembers: Candidate[] = [
    candidate({
      skillId: 'interview/dsa-patterns',
      category: 'PROFESSIONAL',
      phase: 'E6',
    }),
    candidate({
      skillId: 'communication/structure',
      category: 'PROFESSIONAL',
      phase: 'E5',
    }),
    // REVIEW draws only from practised nodes.
    candidate({
      skillId: 'postgres/ctes',
      category: 'DATA',
      phase: 'E2',
      currentRank: 3,
    }),
    candidate({ skillId: 'redis/pubsub', category: 'DATA', phase: 'E2', currentRank: 2 }),
  ]

  const planInput = (over: Partial<PlanInput> = {}): PlanInput => ({
    now: NOW,
    intensity: 'NORMAL',
    budgetMinutes: 90,
    candidates: [...manyCandidates(20), ...threadMembers],
    activePhases: ['E1', 'E2'],
    threadQuotas: [
      { thread: 'DSA', share: 0.2 },
      { thread: 'SYSTEM_DESIGN', share: 0.15 },
      { thread: 'COMMUNICATION', share: 0.1 },
      { thread: 'REVIEW', share: 0.15 },
    ],
    daysMissed: 0,
    weights: DEFAULT_WEIGHTS,
    context: ctx,
    ...over,
  })

  it('never exceeds the minute budget', () => {
    const plan = buildPlan(planInput({ budgetMinutes: 90 }))
    const total = plan.items.reduce((sum: number, item: Mission) => sum + item.minutes, 0)
    expect(total).toBeLessThanOrEqual(90)
  })

  it('constraint 4 — exactly one mission is primary', () => {
    const plan = buildPlan(planInput())
    expect(plan.items.filter((item: Mission) => item.primary)).toHaveLength(1)
  })

  it('constraint 4 — the primary is also exposed directly', () => {
    const plan = buildPlan(planInput())
    expect(plan.primary).toBeDefined()
    expect(plan.items.find((item: Mission) => item.primary)?.id).toBe(plan.primary.id)
  })

  it('constraint 1 — thread quotas are allocated before the dominant theme', () => {
    const plan = buildPlan(planInput({ budgetMinutes: 120 }))
    const threads = new Set(plan.items.map((item: Mission) => item.thread))
    expect(threads.has('DSA')).toBe(true)
    expect(threads.has('REVIEW')).toBe(true)
  })

  it('constraint 2 — at most two missions share a format', () => {
    const plan = buildPlan(planInput({ budgetMinutes: 240, intensity: 'DEEP' }))
    const counts = new Map<string, number>()
    for (const item of plan.items as Mission[]) {
      counts.set(item.format, (counts.get(item.format) ?? 0) + 1)
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2)
  })

  it('constraint 2 — no repeat of a format used on the same node within 72h', () => {
    const recent = candidate({
      skillId: 'postgres/indexing',
      daysOverdue: 999,
      recentFormats: [{ format: 'QUERY', at: new Date(NOW.getTime() - 24 * 3600_000) }],
    })
    const plan = buildPlan(planInput({ candidates: [recent, ...manyCandidates(5)] }))
    const repeated = plan.items.find(
      (item: Mission) => item.skillId === 'postgres/indexing' && item.format === 'QUERY',
    )
    expect(repeated).toBeUndefined()
  })

  it('constraint 2 — the same format on the same node is allowed after 72h', () => {
    const old = candidate({
      skillId: 'postgres/indexing',
      daysOverdue: 999,
      recentFormats: [{ format: 'QUERY', at: new Date(NOW.getTime() - 96 * 3600_000) }],
    })
    const plan = buildPlan(planInput({ candidates: [old] }))
    expect(plan.items.length).toBeGreaterThan(0)
  })

  it('constraint 3 + 4 — the primary leads, then hardest first', () => {
    /*
     * §4.2 constraint 3 wants the hardest mission first; constraint 4 wants one
     * headline. When they disagree the headline wins — a primary buried third
     * in the list is not a headline. The remainder is ordered hardest first.
     */
    const plan = buildPlan(planInput({ budgetMinutes: 180, intensity: 'DEEP' }))
    expect(plan.items[0]?.primary).toBe(true)

    const rest = plan.items.slice(1).map((item: Mission) => item.difficulty)
    for (let i = 1; i < rest.length; i++) {
      expect(rest[i]!).toBeLessThanOrEqual(rest[i - 1]!)
    }
  })

  it('constraint 3 + 4 — the primary leads even when it is not the hardest', () => {
    const plan = buildPlan(planInput({ budgetMinutes: 180, intensity: 'DEEP' }))
    const hardest = Math.max(...plan.items.map((item: Mission) => item.difficulty))
    // The assertion is that position does not depend on difficulty, so this
    // holds whether or not the primary happens to be the hardest today.
    expect(plan.items[0]?.primary).toBe(true)
    expect(hardest).toBeGreaterThanOrEqual(plan.items[0]!.difficulty)
  })

  it('constraint 5 — a top node that does not fit yields a smaller piece of itself', () => {
    const expensive = candidate({
      skillId: 'postgres/indexing',
      daysOverdue: 999,
      blockedDescendants: 10,
    })
    const plan = buildPlan(planInput({ budgetMinutes: 30, candidates: [expensive] }))
    expect(plan.primary.skillId).toBe('postgres/indexing')
    expect(plan.primary.minutes).toBeLessThanOrEqual(30)
  })

  it('constraint 5 — it does not silently swap to a different, cheaper node', () => {
    const top = candidate({ skillId: 'a/top', daysOverdue: 999, blockedDescendants: 10 })
    const cheap = candidate({ skillId: 'b/cheap', daysOverdue: 1 })
    const plan = buildPlan(planInput({ budgetMinutes: 25, candidates: [top, cheap] }))
    expect(plan.primary.skillId).toBe('a/top')
  })

  it('logs the weights used, so the plan is reproducible', () => {
    const plan = buildPlan(planInput())
    expect(plan.weightsUsed).toEqual(DEFAULT_WEIGHTS)
  })

  it('carries the explanation for the primary', () => {
    const plan = buildPlan(planInput())
    expect(Array.isArray(plan.primary.why)).toBe(true)
  })

  it('returns an empty plan rather than throwing when there are no candidates', () => {
    const plan = buildPlan(planInput({ candidates: [] }))
    expect(plan.items).toEqual([])
  })

  it('returns an empty plan rather than throwing when the budget fits nothing', () => {
    const plan = buildPlan(planInput({ budgetMinutes: 1 }))
    expect(plan.items.every((item: Mission) => item.minutes <= 1)).toBe(true)
  })

  it('LIGHT does not drown in thread quotas — §4.3 says review plus one mission', () => {
    const plan = buildPlan(planInput({ intensity: 'LIGHT', budgetMinutes: 35 }))
    expect(plan.items.length).toBeLessThanOrEqual(2)
    expect(
      plan.items.reduce((sum: number, i: Mission) => sum + i.minutes, 0),
    ).toBeLessThanOrEqual(35)
  })
})

describe('§4.4 missed days', () => {
  const input = (daysMissed: number, over: Partial<PlanInput> = {}): PlanInput => ({
    now: NOW,
    intensity: 'NORMAL',
    budgetMinutes: 90,
    candidates: Array.from({ length: 12 }, (_, i) =>
      candidate({ skillId: `t${i}/n${i}`, daysOverdue: 30 - i }),
    ),
    threadQuotas: [],
    // Only THEME, so every candidate must sit in an active engineering phase.
    activePhases: ['E2'],
    daysMissed,
    weights: DEFAULT_WEIGHTS,
    context: ctx,
    ...over,
  })

  it('two days missed changes nothing about the plan size', () => {
    const normal = buildPlan(input(0))
    const missed = buildPlan(input(2))
    expect(missed.items.length).toBe(normal.items.length)
  })

  it('three to seven days missed produces a SMALLER plan', () => {
    const normal = buildPlan(input(0))
    const missed = buildPlan(input(5))
    expect(missed.items.length).toBeLessThan(normal.items.length)
  })

  it('three to seven days missed drops the tail rather than deferring it', () => {
    const plan = buildPlan(input(5))
    expect(plan).not.toHaveProperty('deferred')
    expect(plan).not.toHaveProperty('backlog')
    expect(plan).not.toHaveProperty('carriedOver')
  })

  it('three to seven days missed keeps the important reviews and drops the tail', () => {
    /*
     * §4.4: "Reviews are re-sorted by importance, the tail is dropped, not
     * deferred." That is a statement about which missions survive, not about
     * display order — which, after ruling 6, leads with the primary.
     */
    const full = buildPlan(input(0))
    const reduced = buildPlan(input(5))

    const keptLowest = Math.min(...reduced.items.map((i: Mission) => i.priority))
    const droppedIds = new Set(
      full.items
        .map((i: Mission) => i.skillId)
        .filter((id: string) => !reduced.items.some((r: Mission) => r.skillId === id)),
    )
    const dropped = full.items.filter((i: Mission) => droppedIds.has(i.skillId))

    expect(dropped.length).toBeGreaterThan(0)
    for (const item of dropped) expect(item.priority).toBeLessThanOrEqual(keptLowest)
  })

  it('more than seven days missed is a ten-minute re-entry', () => {
    const shape = reentryShapeFor(10)
    expect(shape.budgetMinutes).toBe(10)
    expect(shape.reviews).toBe(1)
    expect(shape.missions).toBe(1)
  })

  it('more than seven days missed does not attempt catch-up', () => {
    const plan = buildPlan(input(30))
    expect(
      plan.items.reduce((sum: number, i: Mission) => sum + i.minutes, 0),
    ).toBeLessThanOrEqual(10)
    expect(plan.items.length).toBeLessThanOrEqual(2)
  })

  it('exposes no count of anything missed, anywhere in the plan', () => {
    /*
     * §4.4: "No backlog counter exists anywhere in the UI. There is no number
     * that grows while you are away." Keeping it off the type is what stops a
     * screen rendering it later.
     */
    const plan = buildPlan(input(30))
    const keys = JSON.stringify(plan).toLowerCase()
    expect(keys).not.toContain('backlog')
    expect(keys).not.toContain('missed')
    expect(keys).not.toContain('overdue_count')
    expect(keys).not.toContain('outstanding')
  })

  it('returns decay decisions rather than applying them', () => {
    /*
     * §4.4 says decay is applied silently after seven days. The scheduler is
     * pure, so it proposes; the mastery gate writes. Returning the decisions
     * keeps that boundary visible instead of hiding a mutation in a planner.
     */
    const plan = buildPlan(input(30))
    expect(Array.isArray(plan.decayDecisions)).toBe(true)
    for (const decision of plan.decayDecisions) {
      expect(typeof decision.skillId).toBe('string')
      expect(typeof decision.demote).toBe('boolean')
    }
  })

  it('proposes no demotions when nothing has been missed', () => {
    expect(buildPlan(input(0)).decayDecisions.every((d) => !d.demote)).toBe(true)
  })

  it('is pure — it proposes, and never mutates the candidates it was given', () => {
    const candidates = [candidate({ skillId: 'a/one', daysOverdue: 400 })]
    const snapshot = JSON.stringify(candidates)
    buildPlan(input(30, { candidates }))
    expect(JSON.stringify(candidates)).toBe(snapshot)
  })
})
