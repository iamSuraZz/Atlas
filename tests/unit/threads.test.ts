import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  PHASE_1_QUOTAS,
  buildPlan,
  eligibleFormats,
  isEligibleForThread,
  trackOf,
  type Candidate,
  type MissionFormat,
  type PlanInput,
  type ScoringContext,
  type Thread,
} from '@/domain/scheduler'

/*
 * Executable specification for threads, phase gating and format eligibility.
 * M-DS task b; DATA_ML_TRACK.md §3.2 and §10.3.
 *
 * Written before the implementation and expected to be red until it exists.
 *
 * The question this suite exists to answer is narrow and load-bearing: with
 * only E1, E2 and D0 active, can the scheduler offer a deep-learning or MLOps
 * node? Everything else here is the scaffolding that makes that answer
 * trustworthy.
 */

const NOW = new Date('2026-06-01T00:00:00Z')
const ACTIVE = ['E1', 'E2', 'D0'] as const

const base: Candidate = {
  skillId: 'python-data/pandas-core',
  topic: 'python-data',
  category: 'DATA_SCIENCE',
  phase: 'D0',
  currentRank: 0,
  targetRank: 3,
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

const candidate = (over: Partial<Candidate>): Candidate => ({ ...base, ...over })

const ctx: ScoringContext = {
  now: NOW,
  daysToInterview: null,
  weakestCategories: [],
  maxBlockedDescendants: 10,
  maxMinutesToNextLevel: 600,
}

/** Representative nodes, each one a real id from the seeded graph. */
const NODES = {
  // Engineering, active phases
  typescriptGenerics: candidate({
    skillId: 'typescript/generics',
    topic: 'typescript',
    category: 'ENGINEERING_CORE',
    phase: 'E1',
  }),
  postgresIndexing: candidate({
    skillId: 'postgres/indexing',
    topic: 'postgres',
    category: 'DATA',
    phase: 'E2',
  }),
  // Engineering, inactive phases
  distributedCap: candidate({
    skillId: 'distributed/cap',
    topic: 'distributed',
    category: 'SYSTEMS',
    phase: 'E3',
  }),
  communicationStructure: candidate({
    skillId: 'communication/structure',
    topic: 'communication',
    category: 'PROFESSIONAL',
    phase: 'E5',
  }),
  dsaPatterns: candidate({
    skillId: 'interview/dsa-patterns',
    topic: 'interview',
    category: 'PROFESSIONAL',
    phase: 'E6',
  }),
  systemDesignFramework: candidate({
    skillId: 'interview/system-design-framework',
    topic: 'interview',
    category: 'PROFESSIONAL',
    phase: 'E6',
  }),
  behaviouralStories: candidate({
    skillId: 'interview/behavioural-stories',
    topic: 'interview',
    category: 'PROFESSIONAL',
    phase: 'E6',
  }),
  // Data & ML, active phase
  pandasCore: base,
  analyticsSql: candidate({
    skillId: 'analytics-sql/cohort-retention',
    topic: 'analytics-sql',
    category: 'DATA_SCIENCE',
    phase: 'D0',
  }),
  // Data & ML, inactive phases — the ones that must never appear
  vectors: candidate({
    skillId: 'linear-algebra/vectors',
    topic: 'linear-algebra',
    category: 'MATH_STATS',
    phase: 'D1',
  }),
  chartSelection: candidate({
    skillId: 'visualization/chart-selection',
    topic: 'visualization',
    category: 'DATA_SCIENCE',
    phase: 'D2',
  }),
  backprop: candidate({
    skillId: 'deep-learning/neurons-backprop',
    topic: 'deep-learning',
    category: 'MACHINE_LEARNING',
    phase: 'D5',
  }),
  cnns: candidate({
    skillId: 'deep-learning/cnns',
    topic: 'deep-learning',
    category: 'MACHINE_LEARNING',
    phase: 'D5',
  }),
  dataDrift: candidate({
    skillId: 'ml-monitoring/data-drift',
    topic: 'ml-monitoring',
    category: 'MLOPS',
    phase: 'D7',
  }),
  modelRegistry: candidate({
    skillId: 'ml-lifecycle/model-registry',
    topic: 'ml-lifecycle',
    category: 'MLOPS',
    phase: 'D7',
  }),
  sparkFundamentals: candidate({
    skillId: 'big-data/spark-fundamentals',
    topic: 'big-data',
    category: 'DATA_ENGINEERING',
    phase: 'D6',
  }),
}

const planInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  now: NOW,
  intensity: 'DEEP',
  budgetMinutes: 240,
  candidates: Object.values(NODES),
  threadQuotas: PHASE_1_QUOTAS,
  activePhases: [...ACTIVE],
  daysMissed: 0,
  weights: DEFAULT_WEIGHTS,
  context: ctx,
  ...over,
})

// ───────────────────────────────────────────────────────────────────────────
describe('trackOf — the five new categories map to DATA_ML', () => {
  const DATA_ML = [
    'MATH_STATS',
    'DATA_SCIENCE',
    'MACHINE_LEARNING',
    'DATA_ENGINEERING',
    'MLOPS',
  ]
  const ENGINEERING = [
    'ENGINEERING_CORE',
    'BACKEND',
    'DATA',
    'SYSTEMS',
    'QUALITY',
    'AI_ENGINEERING',
    'PROFESSIONAL',
  ]

  it.each(DATA_ML)('%s is DATA_ML', (category) => {
    expect(trackOf(category)).toBe('DATA_ML')
  })

  it.each(ENGINEERING)('%s is ENGINEERING', (category) => {
    expect(trackOf(category)).toBe('ENGINEERING')
  })

  it('treats DATA (postgres, redis) as engineering, not as the data track', () => {
    // The trap: the engineering graph already had a category called DATA long
    // before DATA_SCIENCE existed. They are not the same thing.
    expect(trackOf('DATA')).toBe('ENGINEERING')
    expect(trackOf('DATA_SCIENCE')).toBe('DATA_ML')
  })

  it('refuses an unknown category rather than guessing a track', () => {
    expect(() => trackOf('NOT_A_CATEGORY')).toThrow(/NOT_A_CATEGORY/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('§3.2 quotas', () => {
  it('matches the six shares in §3.2', () => {
    const byThread = Object.fromEntries(PHASE_1_QUOTAS.map((q) => [q.thread, q.share]))
    expect(byThread['DATA_ML']).toBe(0.3)
    expect(byThread['DSA']).toBe(0.15)
    expect(byThread['SYSTEM_DESIGN']).toBe(0.1)
    expect(byThread['COMMUNICATION']).toBe(0.07)
    expect(byThread['REVIEW']).toBe(0.08)
  })

  it('leaves exactly 30% for the engineering theme', () => {
    // THEME is not in the quota list; it takes the remainder, so the remainder
    // is the assertion. §3.2 gives the dominant theme 30%.
    const allocated = PHASE_1_QUOTAS.reduce((n, q) => n + q.share, 0)
    expect(Number((1 - allocated).toFixed(2))).toBe(0.3)
  })

  it('does not list THEME, which would double-allocate it', () => {
    expect(PHASE_1_QUOTAS.some((q) => q.thread === 'THEME')).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('isEligibleForThread — phase gating', () => {
  const eligible = (node: Candidate, thread: Thread, active = [...ACTIVE]) =>
    isEligibleForThread(node, thread, active)

  it('THEME takes engineering nodes in an active phase', () => {
    expect(eligible(NODES.typescriptGenerics, 'THEME')).toBe(true)
    expect(eligible(NODES.postgresIndexing, 'THEME')).toBe(true)
  })

  it('THEME rejects an engineering node whose phase is not active', () => {
    expect(eligible(NODES.distributedCap, 'THEME')).toBe(false)
  })

  it('THEME rejects every Data & ML node, active phase or not', () => {
    expect(eligible(NODES.pandasCore, 'THEME')).toBe(false)
    expect(eligible(NODES.backprop, 'THEME')).toBe(false)
  })

  it('DATA_ML takes data nodes in an active phase', () => {
    expect(eligible(NODES.pandasCore, 'DATA_ML')).toBe(true)
    expect(eligible(NODES.analyticsSql, 'DATA_ML')).toBe(true)
  })

  it('DATA_ML rejects a data node whose phase is not active', () => {
    expect(eligible(NODES.vectors, 'DATA_ML')).toBe(false)
    expect(eligible(NODES.backprop, 'DATA_ML')).toBe(false)
    expect(eligible(NODES.dataDrift, 'DATA_ML')).toBe(false)
  })

  it('DATA_ML rejects every engineering node', () => {
    expect(eligible(NODES.typescriptGenerics, 'DATA_ML')).toBe(false)
    expect(eligible(NODES.postgresIndexing, 'DATA_ML')).toBe(false)
  })

  it('a node with no phase is never eligible for a phase-gated thread', () => {
    // NULL phase means "nobody has decided where this belongs". Offering it
    // would be the scheduler deciding instead.
    const unplaced = candidate({ phase: null, category: 'DATA_SCIENCE' })
    expect(eligible(unplaced, 'DATA_ML')).toBe(false)
    expect(eligible({ ...unplaced, category: 'BACKEND' }, 'THEME')).toBe(false)
  })

  it('DSA draws from the dsa subtree — M-DS ruling 6', () => {
    const arrays = candidate({
      skillId: 'dsa/arrays-hashing',
      topic: 'dsa',
      category: 'ENGINEERING_CORE',
      phase: 'E1',
    })
    expect(eligible(arrays, 'DSA')).toBe(true)
    // ...and still from the two interview nodes that are the explain-aloud half.
    expect(eligible(NODES.dsaPatterns, 'DSA')).toBe(true)
    // It is not a THEME node despite being ENGINEERING_CORE in an active phase.
    expect(eligible(arrays, 'THEME')).toBe(true)
    expect(eligible(arrays, 'SYSTEM_DESIGN')).toBe(false)
    expect(eligible(arrays, 'COMMUNICATION')).toBe(false)
  })

  it('DSA, SYSTEM_DESIGN and COMMUNICATION ignore phase entirely', () => {
    // All three map to topics sitting in E5/E6. If they respected phase they
    // would be unreachable until the final phases, which is the opposite of
    // what §3.2 budgets them for.
    expect(eligible(NODES.dsaPatterns, 'DSA')).toBe(true)
    expect(eligible(NODES.systemDesignFramework, 'SYSTEM_DESIGN')).toBe(true)
    expect(eligible(NODES.distributedCap, 'SYSTEM_DESIGN')).toBe(true)
    expect(eligible(NODES.communicationStructure, 'COMMUNICATION')).toBe(true)

    // ...and still ignore it when the active list is empty.
    expect(eligible(NODES.dsaPatterns, 'DSA', [])).toBe(true)
    expect(eligible(NODES.communicationStructure, 'COMMUNICATION', [])).toBe(true)
  })

  it('splits the interview topic across the three threads it actually spans', () => {
    expect(eligible(NODES.dsaPatterns, 'DSA')).toBe(true)
    expect(eligible(NODES.dsaPatterns, 'SYSTEM_DESIGN')).toBe(false)
    expect(eligible(NODES.systemDesignFramework, 'SYSTEM_DESIGN')).toBe(true)
    expect(eligible(NODES.systemDesignFramework, 'DSA')).toBe(false)
    expect(eligible(NODES.behaviouralStories, 'COMMUNICATION')).toBe(true)
    expect(eligible(NODES.behaviouralStories, 'DSA')).toBe(false)
  })

  it('REVIEW draws from any practised node, on any track, in any phase', () => {
    const practised = (node: Candidate) => ({ ...node, currentRank: 2 })
    expect(eligible(practised(NODES.backprop), 'REVIEW')).toBe(true)
    expect(eligible(practised(NODES.dataDrift), 'REVIEW')).toBe(true)
    expect(eligible(practised(NODES.distributedCap), 'REVIEW')).toBe(true)
    expect(eligible(practised(NODES.pandasCore), 'REVIEW')).toBe(true)
  })

  it('REVIEW rejects a node that has never been practised', () => {
    // currentRank 0 is UNASSESSED. There is nothing to review.
    expect(eligible(NODES.backprop, 'REVIEW')).toBe(false)
    expect(eligible(NODES.typescriptGenerics, 'REVIEW')).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('eligibleFormats', () => {
  const formats = (node: Candidate, thread: Thread = 'DATA_ML') =>
    eligibleFormats(node, thread)

  it('maths nodes get WATCH, MATH_BY_HAND and EXPLAIN', () => {
    expect(formats(NODES.vectors)).toEqual(['WATCH', 'MATH_BY_HAND', 'EXPLAIN'])
  })

  it('every MATH_STATS topic is a maths node, not just linear algebra', () => {
    for (const topic of ['calculus', 'probability', 'statistics']) {
      const node = candidate({ category: 'MATH_STATS', topic, phase: 'D1' })
      expect(formats(node)).toContain('MATH_BY_HAND')
    }
  })

  it('tool and ML nodes get NOTEBOOK, WATCH and EXPLAIN', () => {
    expect(formats(NODES.pandasCore)).toEqual(['NOTEBOOK', 'WATCH', 'EXPLAIN'])
    expect(formats(NODES.backprop)).toEqual(['NOTEBOOK', 'WATCH', 'EXPLAIN'])
    expect(formats(NODES.sparkFundamentals)).toEqual(['NOTEBOOK', 'WATCH', 'EXPLAIN'])
    expect(formats(NODES.dataDrift)).toEqual(['NOTEBOOK', 'WATCH', 'EXPLAIN'])
  })

  it('visualization leads with VISUALIZE', () => {
    expect(formats(NODES.chartSelection)[0]).toBe('VISUALIZE')
  })

  it('never gives a maths node NOTEBOOK, or a visualization node MATH_BY_HAND', () => {
    expect(formats(NODES.vectors)).not.toContain('NOTEBOOK')
    expect(formats(NODES.chartSelection)).not.toContain('MATH_BY_HAND')
  })

  it('leaves the engineering threads on their existing formats', () => {
    expect(formats(NODES.typescriptGenerics, 'THEME')).toContain('BUILD')
    expect(formats(NODES.dsaPatterns, 'DSA')).toEqual(['BUILD', 'EXPLAIN'])
    expect(formats(NODES.systemDesignFramework, 'SYSTEM_DESIGN')).toEqual([
      'DESIGN',
      'DEFEND',
    ])
    expect(formats(NODES.communicationStructure, 'COMMUNICATION')).toEqual([
      'EXPLAIN',
      'TEACH',
    ])
  })

  it('never offers a Data & ML format to an engineering node', () => {
    const dataMlOnly: MissionFormat[] = ['WATCH', 'NOTEBOOK', 'MATH_BY_HAND', 'VISUALIZE']
    for (const thread of ['THEME', 'DSA', 'SYSTEM_DESIGN', 'COMMUNICATION'] as Thread[]) {
      for (const format of formats(NODES.typescriptGenerics, thread)) {
        expect(dataMlOnly).not.toContain(format)
      }
    }
  })

  it('REVIEW is REVIEW whatever the node is made of', () => {
    expect(formats(NODES.backprop, 'REVIEW')).toEqual(['REVIEW'])
    expect(formats(NODES.typescriptGenerics, 'REVIEW')).toEqual(['REVIEW'])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('rotation still applies', () => {
  it('will not repeat a format used on the same node within 72h', () => {
    const used = candidate({
      skillId: 'python-data/numpy-vectorization',
      recentFormats: [
        { format: 'NOTEBOOK', at: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
      ],
    })

    const plan = buildPlan(planInput({ candidates: [used], budgetMinutes: 120 }))
    const mine = plan.items.filter((m) => m.skillId === used.skillId)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((m) => m.format !== 'NOTEBOOK')).toBe(true)
  })

  it('releases the format once the 72h window has passed', () => {
    const stale = candidate({
      recentFormats: [
        { format: 'NOTEBOOK', at: new Date(NOW.getTime() - 73 * 60 * 60 * 1000) },
      ],
    })
    const plan = buildPlan(planInput({ candidates: [stale], budgetMinutes: 120 }))
    expect(plan.items.some((m) => m.format === 'NOTEBOOK')).toBe(true)
  })

  it('still caps any one format at two per plan', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      candidate({ skillId: `python-data/n${i}`, topic: 'python-data', phase: 'D0' }),
    )
    const plan = buildPlan(planInput({ candidates: many }))
    const counts = new Map<MissionFormat, number>()
    for (const m of plan.items) counts.set(m.format, (counts.get(m.format) ?? 0) + 1)
    for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('the claim: E1/E2/D0 active means no deep-learning and no MLOps', () => {
  const FORBIDDEN = [
    'deep-learning/',
    'ml-monitoring/',
    'ml-lifecycle/',
    'model-serving/',
  ]
  const isForbidden = (skillId: string) => FORBIDDEN.some((p) => skillId.startsWith(p))

  it('excludes them from a full plan at every intensity', () => {
    for (const intensity of ['LIGHT', 'NORMAL', 'DEEP'] as const) {
      const plan = buildPlan(
        planInput({ intensity, budgetMinutes: budgetForTest(intensity) }),
      )
      const leaked = plan.items.filter((m) => isForbidden(m.skillId))
      expect(leaked).toEqual([])
    }
  })

  it('excludes them thread by thread, so no single gate is carrying the result', () => {
    const threads: Thread[] = [
      'THEME',
      'DATA_ML',
      'DSA',
      'SYSTEM_DESIGN',
      'COMMUNICATION',
      'REVIEW',
    ]
    for (const node of [
      NODES.backprop,
      NODES.cnns,
      NODES.dataDrift,
      NODES.modelRegistry,
    ]) {
      for (const thread of threads) {
        expect(isEligibleForThread(node, thread, [...ACTIVE])).toBe(false)
      }
    }
  })

  it('excludes them even when they outrank everything else', () => {
    /*
     * The strongest form of the claim. A phase gate that only holds while the
     * forbidden node is unattractive is not a gate — so give it the maximum
     * of every term that raises priority and check it still cannot appear.
     */
    const irresistible = (node: Candidate): Candidate => ({
      ...node,
      currentRank: 0,
      targetRank: 5,
      daysOverdue: 9999,
      halfLifeDays: 1,
      marketWeight: 1,
      blockedDescendants: 99,
      lastSelfRating: 1,
      estimatedMinutesToNextLevel: 1,
    })

    const plan = buildPlan(
      planInput({
        candidates: [
          irresistible(NODES.backprop),
          irresistible(NODES.dataDrift),
          NODES.pandasCore,
          NODES.typescriptGenerics,
        ],
      }),
    )

    expect(plan.items.filter((m) => isForbidden(m.skillId))).toEqual([])
    expect(plan.items.length).toBeGreaterThan(0)
  })

  it('the same nodes DO appear once their phase is activated', () => {
    /*
     * Without this the suite would pass just as happily against a scheduler
     * that never returns anything at all.
     */
    const plan = buildPlan(planInput({ activePhases: ['E1', 'E2', 'D0', 'D5', 'D7'] }))
    expect(plan.items.some((m) => isForbidden(m.skillId))).toBe(true)
  })

  it('a practised deep-learning node is reachable ONLY through REVIEW', () => {
    /*
     * "REVIEW draws from any practised node" and "DATA_ML comes only from
     * active phases" pull in opposite directions here, and the resolution is
     * deliberate: closing a phase must not make you forget what you learned in
     * it, but it does stop new work there.
     */
    const practised = { ...NODES.backprop, currentRank: 3, daysOverdue: 40 }

    expect(isEligibleForThread(practised, 'REVIEW', [...ACTIVE])).toBe(true)
    for (const thread of [
      'THEME',
      'DATA_ML',
      'DSA',
      'SYSTEM_DESIGN',
      'COMMUNICATION',
    ] as Thread[]) {
      expect(isEligibleForThread(practised, thread, [...ACTIVE])).toBe(false)
    }

    const plan = buildPlan(planInput({ candidates: [practised, NODES.pandasCore] }))
    for (const m of plan.items.filter((x) => isForbidden(x.skillId))) {
      expect(m.thread).toBe('REVIEW')
      expect(m.format).toBe('REVIEW')
    }
  })
})

function budgetForTest(intensity: 'LIGHT' | 'NORMAL' | 'DEEP'): number {
  return { LIGHT: 40, NORMAL: 100, DEEP: 240 }[intensity]
}
