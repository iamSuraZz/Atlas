import { describe, expect, it } from 'vitest'
import { HALF_LIFE_DAYS, assessDecay } from '@/domain/review/decay'
import {
  INITIAL_STABILITY_DAYS,
  MIN_STABILITY_DAYS,
  TARGET_RETENTION,
  afterFailure,
  afterSuccess,
  intervalDays,
  nextReviewAt,
  retrievability,
} from '@/domain/review/scheduling'

/*
 * Model is docs/LEARNING_ENGINE.md §3.2 and §3.3. Every date is fixed and
 * `now` is injected — these functions never read a clock, which is what makes
 * a 2x-half-life demotion testable without waiting a year for one.
 */

const NOW = new Date('2026-06-01T00:00:00Z')
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('retrievability', () => {
  it('is 1 the moment of a review', () => {
    expect(retrievability(0, 10)).toBe(1)
  })

  it('falls monotonically as time passes', () => {
    const curve = [0, 1, 5, 20, 100].map((d) => retrievability(d, 10))
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!).toBeLessThan(curve[i - 1]!)
    }
  })

  it('reaches 1/e at exactly one stability period, per r(t) = exp(-t/s)', () => {
    expect(retrievability(10, 10)).toBeCloseTo(Math.exp(-1), 10)
  })

  it('treats an unpractised node as fully forgotten rather than dividing by zero', () => {
    expect(retrievability(5, 0)).toBe(0)
  })
})

describe('on success', () => {
  it('grows stability', () => {
    const next = afterSuccess({ stabilityDays: 10, difficulty: 5 }, 10)
    expect(next.stabilityDays).toBeGreaterThan(10)
  })

  it('leaves difficulty untouched — only failure moves it', () => {
    const next = afterSuccess({ stabilityDays: 10, difficulty: 5 }, 10)
    expect(next.difficulty).toBe(5)
  })

  it('grows stability more for a later review than an immediate one', () => {
    const early = afterSuccess({ stabilityDays: 10, difficulty: 5 }, 1)
    const late = afterSuccess({ stabilityDays: 10, difficulty: 5 }, 30)
    expect(late.stabilityDays).toBeGreaterThan(early.stabilityDays)
  })

  it('grows stability more for an easy node than a hard one', () => {
    const easy = afterSuccess({ stabilityDays: 10, difficulty: 1 }, 10)
    const hard = afterSuccess({ stabilityDays: 10, difficulty: 10 }, 10)
    expect(easy.stabilityDays).toBeGreaterThan(hard.stabilityDays)
  })

  it('never shrinks stability, even when reviewed with nothing forgotten', () => {
    const next = afterSuccess({ stabilityDays: 10, difficulty: 5 }, 0)
    expect(next.stabilityDays).toBeGreaterThanOrEqual(10)
  })

  it('seeds stability on the first success, since zero can never grow by multiplication', () => {
    const next = afterSuccess({ stabilityDays: 0, difficulty: 5 }, 0)
    expect(next.stabilityDays).toBe(INITIAL_STABILITY_DAYS)
  })
})

describe('on failure', () => {
  it('halves stability', () => {
    expect(afterFailure({ stabilityDays: 10, difficulty: 5 }).stabilityDays).toBe(5)
  })

  it('raises difficulty by one', () => {
    expect(afterFailure({ stabilityDays: 10, difficulty: 5 }).difficulty).toBe(6)
  })

  it('caps difficulty at 10', () => {
    expect(afterFailure({ stabilityDays: 10, difficulty: 10 }).difficulty).toBe(10)
  })

  it('floors stability so a run of failures cannot reach zero', () => {
    let state = { stabilityDays: 1, difficulty: 5 }
    for (let i = 0; i < 20; i++) state = afterFailure(state)
    expect(state.stabilityDays).toBe(MIN_STABILITY_DAYS)
    expect(state.stabilityDays).toBeGreaterThan(0)
  })
})

describe('intervals', () => {
  it('schedules the next review where retrievability falls to the target', () => {
    const s = 40
    const days = intervalDays(s)
    expect(retrievability(days, s)).toBeCloseTo(TARGET_RETENTION, 10)
  })

  it('stays monotonic across a run of successful reviews', () => {
    let state = { stabilityDays: INITIAL_STABILITY_DAYS, difficulty: 5 }
    const intervals: number[] = []

    for (let i = 0; i < 12; i++) {
      const due = intervalDays(state.stabilityDays)
      intervals.push(due)
      // Reviewed exactly when due, which is the scheduler's intent.
      state = afterSuccess(state, due)
    }

    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!).toBeGreaterThanOrEqual(intervals[i - 1]!)
    }
  })

  it('shortens the interval after a failure', () => {
    const before = intervalDays(20)
    const after = intervalDays(
      afterFailure({ stabilityDays: 20, difficulty: 5 }).stabilityDays,
    )
    expect(after).toBeLessThan(before)
  })

  it('returns a date offset from the supplied now, never from the clock', () => {
    const at = nextReviewAt(NOW, 40)
    expect(at.getTime()).toBe(NOW.getTime() + Math.round(intervalDays(40) * 86_400_000))
  })
})

describe('decay half-lives', () => {
  it('matches the table in §3.2', () => {
    expect(HALF_LIFE_DAYS).toEqual({
      PROCEDURAL_DAILY: 180,
      CONCEPTUAL: 90,
      RECALL_HEAVY: 45,
      NARRATIVE: 120,
    })
  })
})

describe('decay assessment', () => {
  it('is quiet before one half-life', () => {
    const result = assessDecay({
      now: NOW,
      lastSuccessAt: daysBefore(44),
      decay: 'RECALL_HEAVY',
    })
    expect(result.dueForReview).toBe(false)
    expect(result.shouldDemote).toBe(false)
  })

  it('queues for review at one half-life', () => {
    const result = assessDecay({
      now: NOW,
      lastSuccessAt: daysBefore(45),
      decay: 'RECALL_HEAVY',
    })
    expect(result.dueForReview).toBe(true)
    expect(result.shouldDemote).toBe(false)
  })

  it('demotes one level at two half-lives', () => {
    const result = assessDecay({
      now: NOW,
      lastSuccessAt: daysBefore(90),
      decay: 'RECALL_HEAVY',
    })
    expect(result.dueForReview).toBe(true)
    expect(result.shouldDemote).toBe(true)
  })

  it('uses the right half-life per class', () => {
    const at100 = (decay: 'PROCEDURAL_DAILY' | 'CONCEPTUAL') =>
      assessDecay({ now: NOW, lastSuccessAt: daysBefore(100), decay })
    expect(at100('CONCEPTUAL').dueForReview).toBe(true)
    expect(at100('PROCEDURAL_DAILY').dueForReview).toBe(false)
  })

  it('never demotes a NARRATIVE node — stories drift, they do not decay', () => {
    const result = assessDecay({
      now: NOW,
      lastSuccessAt: daysBefore(400),
      decay: 'NARRATIVE',
    })
    expect(result.dueForReview).toBe(true)
    expect(result.shouldDemote).toBe(false)
  })

  it('queues an unpractised node without demoting it', () => {
    const result = assessDecay({ now: NOW, lastSuccessAt: null, decay: 'CONCEPTUAL' })
    expect(result.dueForReview).toBe(true)
    expect(result.shouldDemote).toBe(false)
    expect(result.daysSinceSuccess).toBeNull()
  })
})
