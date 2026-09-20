import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  explain,
  explainText,
  scorePriority,
  type Candidate,
  type ClauseKind,
  type Explanation,
  type ScoringContext,
  type Weights,
} from '@/domain/scheduler'

/*
 * "Why this today". LEARNING_ENGINE.md §4.5.
 *
 * The claim the feature makes is that it cannot lie about its reasoning,
 * because the reasoning is what generates it. That claim is only worth
 * anything if something checks it, which is what the property test at the
 * bottom of this file is for.
 *
 * The invariant: a clause may only be emitted when the scoring term it derives
 * from made a non-zero contribution to the priority that selected the node.
 * A sentence about being overdue, on a node whose overdue term contributed
 * nothing, is a plausible-sounding fabrication — exactly the failure an LLM
 * would produce, arrived at without one.
 */

const NOW = new Date('2026-06-01T00:00:00Z')

const base: Candidate = {
  skillId: 'postgres/indexing',
  category: 'DATA',
  // No gap by default, so a clause test isolates the clause it names.
  // The GAP tests set their own ranks.
  currentRank: 3,
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

const ctx: ScoringContext = {
  now: NOW,
  daysToInterview: null,
  weakestCategories: [],
  maxBlockedDescendants: 10,
  maxMinutesToNextLevel: 600,
}

const candidate = (over: Partial<Candidate>): Candidate => ({ ...base, ...over })

const scored = (
  over: Partial<Candidate>,
  context: Partial<ScoringContext> = {},
  weights: Weights = DEFAULT_WEIGHTS,
) => scorePriority(candidate(over), { ...ctx, ...context }, weights)

const kinds = (node: Parameters<typeof explain>[0]): ClauseKind[] =>
  explain(node).map((clause: Explanation) => clause.kind)

describe('§4.5 clauses', () => {
  it('says nothing about a node with nothing to say', () => {
    expect(explain(scored({}))).toEqual([])
  })

  it('reports how long since the last review', () => {
    const [clause] = explain(scored({ daysOverdue: 11 }))
    expect(clause?.kind).toBe('OVERDUE')
    expect(clause?.text).toContain('11d ago')
  })

  it('says nothing about overdue at zero days', () => {
    expect(kinds(scored({ daysOverdue: 0 }))).not.toContain('OVERDUE')
  })

  it('says nothing about overdue for a node never practised', () => {
    expect(kinds(scored({ daysOverdue: null }))).not.toContain('OVERDUE')
  })

  it('reports the count of blocked skills and names one', () => {
    const [clause] = explain(
      scored({ blockedDescendants: 3, topBlockedSkillId: 'systems/scalability' }),
    )
    expect(clause?.kind).toBe('UNBLOCKS')
    expect(clause?.text).toContain('Blocks 3')
    expect(clause?.text).toContain('systems/scalability')
  })

  it('still reports blocked skills when no single one can be named', () => {
    const [clause] = explain(scored({ blockedDescendants: 2, topBlockedSkillId: null }))
    expect(clause?.text).toContain('Blocks 2')
    expect(clause?.text).not.toContain('incl.')
  })

  it('reports high role weight strictly above 0.7', () => {
    expect(kinds(scored({ marketWeight: 0.71 }))).toContain('ROLE_WEIGHT')
    expect(kinds(scored({ marketWeight: 0.7 }))).not.toContain('ROLE_WEIGHT')
  })

  it('reports interview proximity with the day count', () => {
    const [clause] = explain(
      scored({ category: 'DATA' }, { daysToInterview: 9, weakestCategories: ['DATA'] }),
    )
    expect(clause?.kind).toBe('INTERVIEW')
    expect(clause?.text).toContain('9d')
  })

  it('says nothing about an interview outside the 14-day window', () => {
    expect(
      kinds(
        scored(
          { category: 'DATA' },
          { daysToInterview: 20, weakestCategories: ['DATA'] },
        ),
      ),
    ).not.toContain('INTERVIEW')
  })

  it('reports how far below the target the node is', () => {
    const [clause] = explain(scored({ currentRank: 0, targetRank: 3 }))
    expect(clause?.kind).toBe('GAP')
    expect(clause?.text).toBe('3 levels below your PRACTICAL target')
  })

  it('uses the singular for a one-level gap', () => {
    const [clause] = explain(scored({ currentRank: 2, targetRank: 3 }))
    expect(clause?.text).toBe('1 level below your PRACTICAL target')
  })

  it('names the target state, not a rank number', () => {
    const [clause] = explain(scored({ currentRank: 0, targetRank: 5 }))
    expect(clause?.text).toContain('MASTERED')
  })

  it('says nothing about the gap once the target is reached', () => {
    expect(kinds(scored({ currentRank: 3, targetRank: 3 }))).not.toContain('GAP')
  })

  it('reports a low self-rating now that §4.1 scores it', () => {
    const [clause] = explain(scored({ currentRank: 3, targetRank: 3, lastSelfRating: 2 }))
    expect(clause?.kind).toBe('CONFIDENCE')
    expect(clause?.text).toContain('2/5')
  })

  it('says nothing about a confident rating', () => {
    expect(
      kinds(scored({ currentRank: 3, targetRank: 3, lastSelfRating: 4 })),
    ).not.toContain('CONFIDENCE')
  })

  it('orders clauses as §4.5 lists them', () => {
    const parts = explain(
      scored(
        {
          daysOverdue: 11,
          blockedDescendants: 3,
          topBlockedSkillId: 'systems/scalability',
          marketWeight: 0.9,
          lastSelfRating: 2,
          currentRank: 0,
          targetRank: 3,
          category: 'DATA',
        },
        { daysToInterview: 9, weakestCategories: ['DATA'] },
      ),
    )
    expect(parts.map((c: Explanation) => c.kind)).toEqual([
      'GAP',
      'OVERDUE',
      'UNBLOCKS',
      'ROLE_WEIGHT',
      'CONFIDENCE',
      'INTERVIEW',
    ])
  })

  it('renders as the separated line §4.5 shows', () => {
    const line = explainText(
      scored({
        currentRank: 3,
        targetRank: 3,
        daysOverdue: 11,
        blockedDescendants: 3,
        topBlockedSkillId: 'a/b',
      }),
    )
    expect(line).toBe('Last reviewed 11d ago · Blocks 3 skills incl. a/b')
  })
})

describe('every clause carries its own provenance', () => {
  it('names the scoring term it derives from', () => {
    const [clause] = explain(scored({ daysOverdue: 11 }))
    expect(clause?.term).toBe('overdueFactor')
    expect(clause?.weightKey).toBe('w2')
  })

  it('reports the contribution as weight times term value', () => {
    const node = scored({ daysOverdue: 45, halfLifeDays: 90 })
    const [clause] = explain(node)
    expect(clause?.contribution).toBeCloseTo(
      DEFAULT_WEIGHTS.w2 * node.terms.overdueFactor,
      10,
    )
  })

  it('maps each clause kind to a distinct term', () => {
    const node = scored(
      {
        daysOverdue: 11,
        blockedDescendants: 3,
        topBlockedSkillId: 'a/b',
        marketWeight: 0.9,
        category: 'DATA',
      },
      { daysToInterview: 9, weakestCategories: ['DATA'] },
    )
    const terms = explain(node).map((c: Explanation) => c.term)
    expect(new Set(terms).size).toBe(terms.length)
  })
})

describe('a zeroed weight silences its clause', () => {
  /*
   * Weights are tunable and stored in config (§4.1). Tuning one to zero means
   * that factor did not influence today's plan, so the plan must stop citing
   * it — even though the underlying condition is still true.
   */
  const zeroed = (key: keyof Weights): Weights => ({ ...DEFAULT_WEIGHTS, [key]: 0 })

  it('w2 = 0 silences OVERDUE on a node that is plainly overdue', () => {
    expect(kinds(scored({ daysOverdue: 40 }, {}, zeroed('w2')))).not.toContain('OVERDUE')
  })

  it('w5 = 0 silences UNBLOCKS on a node that plainly blocks others', () => {
    expect(
      kinds(
        scored({ blockedDescendants: 4, topBlockedSkillId: 'a/b' }, {}, zeroed('w5')),
      ),
    ).not.toContain('UNBLOCKS')
  })

  it('w3 = 0 silences ROLE_WEIGHT on a high-weight node', () => {
    expect(kinds(scored({ marketWeight: 0.95 }, {}, zeroed('w3')))).not.toContain(
      'ROLE_WEIGHT',
    )
  })

  it('w1 = 0 silences GAP on a node far below target', () => {
    expect(
      kinds(scored({ currentRank: 0, targetRank: 5 }, {}, zeroed('w1'))),
    ).not.toContain('GAP')
  })

  it('w8 = 0 silences CONFIDENCE on a shaky node', () => {
    expect(
      kinds(
        scored({ currentRank: 3, targetRank: 3, lastSelfRating: 1 }, {}, zeroed('w8')),
      ),
    ).not.toContain('CONFIDENCE')
  })

  it('w4 = 0 silences INTERVIEW inside the window', () => {
    expect(
      kinds(
        scored(
          { category: 'DATA' },
          { daysToInterview: 3, weakestCategories: ['DATA'] },
          zeroed('w4'),
        ),
      ),
    ).not.toContain('INTERVIEW')
  })

  it('all weights zero produces no explanation at all', () => {
    const silent: Weights = { w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, w6: 0, w7: 0, w8: 0 }
    const node = scored(
      {
        daysOverdue: 40,
        blockedDescendants: 4,
        topBlockedSkillId: 'a/b',
        marketWeight: 0.95,
        category: 'DATA',
      },
      { daysToInterview: 3, weakestCategories: ['DATA'] },
      silent,
    )
    expect(explain(node)).toEqual([])
  })
})

describe('THE INVARIANT — no clause without a contribution that earned it', () => {
  /*
   * Seeded so a failure reproduces exactly. Math.random would report a
   * different counterexample on every run, which is the one thing a property
   * test must not do.
   */
  function rng(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const pick = <T>(r: () => number, xs: readonly T[]): T =>
    xs[Math.floor(r() * xs.length)]!

  function randomWeights(r: () => number): Weights {
    const keys: (keyof Weights)[] = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']
    const w = {} as Weights
    // Zero roughly a third of the weights, so the silencing path is exercised.
    for (const k of keys) w[k] = r() < 0.33 ? 0 : Number(r().toFixed(3))
    return w
  }

  function randomCandidate(r: () => number): Candidate {
    return {
      skillId: `t${Math.floor(r() * 50)}/n${Math.floor(r() * 50)}`,
      category: pick(r, ['DATA', 'SYSTEMS', 'BACKEND', 'PROFESSIONAL']),
      currentRank: Math.floor(r() * 6),
      targetRank: Math.floor(r() * 6),
      halfLifeDays: pick(r, [45, 90, 120, 180]),
      daysOverdue: r() < 0.25 ? null : Math.floor(r() * 400) - 20,
      marketWeight: Number(r().toFixed(3)),
      blockedDescendants: Math.floor(r() * 14),
      minutesSpentLast72h: Math.floor(r() * 300),
      estimatedMinutesToNextLevel: r() < 0.5 ? null : Math.floor(r() * 900),
      lastSelfRating: r() < 0.4 ? null : 1 + Math.floor(r() * 5),
      topBlockedSkillId: r() < 0.5 ? null : 'x/y',
      recentFormats: [],
    }
  }

  function randomContext(r: () => number): ScoringContext {
    return {
      now: NOW,
      daysToInterview: r() < 0.5 ? null : Math.floor(r() * 40) - 5,
      weakestCategories: r() < 0.5 ? [] : [pick(r, ['DATA', 'SYSTEMS', 'BACKEND'])],
      maxBlockedDescendants: 10,
      maxMinutesToNextLevel: 600,
    }
  }

  it('holds across 5000 generated nodes and weight sets', () => {
    const r = rng(20260921)
    let emitted = 0

    for (let i = 0; i < 5000; i++) {
      const weights = randomWeights(r)
      const node = scorePriority(randomCandidate(r), randomContext(r), weights)

      for (const clause of explain(node)) {
        emitted++
        const seed = `iteration ${i}, clause ${clause.kind}`

        // 1. The weight behind this clause is not zero.
        expect(weights[clause.weightKey], seed).not.toBe(0)

        // 2. The term behind it is not zero.
        expect(node.terms[clause.term], seed).not.toBe(0)

        // 3. The stated contribution is the real one, not a decoration.
        expect(clause.contribution, seed).toBeCloseTo(
          weights[clause.weightKey] * node.terms[clause.term],
          9,
        )

        // 4. And it is genuinely non-zero.
        expect(clause.contribution, seed).not.toBe(0)
        expect(Number.isFinite(clause.contribution), seed).toBe(true)
      }
    }

    // A property that never fires proves nothing.
    expect(emitted).toBeGreaterThan(500)
  })

  it('never emits a clause kind outside the declared set', () => {
    const r = rng(7)
    const allowed = new Set<ClauseKind>([
      'GAP',
      'OVERDUE',
      'UNBLOCKS',
      'ROLE_WEIGHT',
      'CONFIDENCE',
      'INTERVIEW',
    ])

    for (let i = 0; i < 1000; i++) {
      const node = scorePriority(randomCandidate(r), randomContext(r), randomWeights(r))
      for (const clause of explain(node)) expect(allowed.has(clause.kind)).toBe(true)
    }
  })

  it('emits each clause at most once per node', () => {
    const r = rng(11)

    for (let i = 0; i < 1000; i++) {
      const node = scorePriority(randomCandidate(r), randomContext(r), randomWeights(r))
      const seen = explain(node).map((c: Explanation) => c.kind)
      expect(new Set(seen).size).toBe(seen.length)
    }
  })

  it('is pure — explaining twice gives the same answer and mutates nothing', () => {
    const node = scored({
      daysOverdue: 11,
      blockedDescendants: 2,
      topBlockedSkillId: 'a/b',
    })
    const snapshot = JSON.stringify(node)
    const first = explain(node)
    const second = explain(node)
    expect(second).toEqual(first)
    expect(JSON.stringify(node)).toBe(snapshot)
  })

  it('never emits a clause for a term the score subtracts', () => {
    /*
     * Saturation and cost lower priority. A clause explaining why a node was
     * chosen cannot cite a reason it was nearly rejected.
     */
    const r = rng(23)
    for (let i = 0; i < 1000; i++) {
      const node = scorePriority(randomCandidate(r), randomContext(r), randomWeights(r))
      for (const clause of explain(node)) {
        expect(['recentSaturation', 'estimatedCost']).not.toContain(clause.term)
      }
    }
  })
})
