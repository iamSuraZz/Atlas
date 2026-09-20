/*
 * fsrs-lite review scheduling. Model is docs/LEARNING_ENGINE.md §3.3.
 *
 *   r(t) = exp(-t / s)
 *   success: s <- s * (1 + f(d) * (1 - r))
 *   failure: s <- s * 0.5,  d <- min(10, d + 1)
 *   next_review = now + s * ln(1 / target_retention)
 *
 * Applied to concepts rather than flashcards: you review "postgres/indexing"
 * by debugging a slow query, not by flipping a card. Same schedule, different
 * activity — which §5 relies on as the anti-boredom mechanism.
 *
 * Pure: no clock, no database, no randomness.
 */

export type ReviewState = {
  /** Days. Larger means the memory survives longer before review is due. */
  readonly stabilityDays: number
  /** 1..10, intrinsic to the node. Moves only on failure. */
  readonly difficulty: number
}

/*
 * 0.60, not the 0.90 in the original §3.3 text.
 *
 * §3.3 contained two incompatible statements: the prose called s "days until
 * ~90% recall", while r(t) = exp(-t/s) puts one stability period at 1/e ~ 0.37.
 * The formula was right and the prose was wrong. Keeping 0.90 as the target
 * made the interval ~0.105 * s, which meant reviewing on time left (1 - r) at
 * 0.10 and stability grew only 6% per review — a first interval of two and a
 * half hours that took dozens of reviews to reach a day.
 *
 * At 0.60 the interval is ~0.51 * s, reviews land nearer the 1/e point, and
 * stability compounds at a usable rate.
 */
export const TARGET_RETENTION = 0.6

/**
 * First success seeds stability, because `s * k` can never lift zero. A day is
 * deliberately short: a concept met once should come back tomorrow, not in a
 * week. §3.3 does not specify this value.
 */
export const INITIAL_STABILITY_DAYS = 1

/**
 * Floor for stability. Repeated halving approaches zero, and a persisted zero
 * would make `retrievability` undefined for that node forever.
 */
export const MIN_STABILITY_DAYS = 0.1

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * Probability the memory is still retrievable after `elapsedDays`.
 *
 * Stability of zero means nothing has been learned yet, so nothing is retained.
 * Returning 0 rather than dividing by zero also makes `1 - r` equal 1, which
 * gives a first review the largest possible stability gain.
 */
export function retrievability(elapsedDays: number, stabilityDays: number): number {
  if (stabilityDays <= 0) return 0
  return Math.exp(-Math.max(0, elapsedDays) / stabilityDays)
}

/**
 * f(d) from §3.3, which the document leaves unspecified beyond "harder-and-later
 * reviews grow stability most". Later is already carried by the `(1 - r)` term;
 * this supplies the other half — an easy node consolidates faster than a hard
 * one, so the factor falls as difficulty rises: d=1 gives 1.0, d=10 gives 0.1.
 */
function difficultyFactor(difficulty: number): number {
  return (11 - clamp(difficulty, 1, 10)) / 10
}

/**
 * A successful review. Stability grows most when the review was hard-won —
 * long elapsed time on an easy node. Difficulty is untouched: §3.3 moves it
 * only on failure.
 */
export function afterSuccess(state: ReviewState, elapsedDays: number): ReviewState {
  const difficulty = clamp(state.difficulty, 1, 10)

  if (state.stabilityDays <= 0) {
    return { stabilityDays: INITIAL_STABILITY_DAYS, difficulty }
  }

  const r = retrievability(elapsedDays, state.stabilityDays)
  const grown = state.stabilityDays * (1 + difficultyFactor(difficulty) * (1 - r))

  // Never shrinks: at r = 1 the multiplier is exactly 1.
  return { stabilityDays: Math.max(state.stabilityDays, grown), difficulty }
}

/** A failed review. Stability halves, difficulty rises one, capped at 10. */
export function afterFailure(state: ReviewState): ReviewState {
  return {
    stabilityDays: Math.max(MIN_STABILITY_DAYS, state.stabilityDays * 0.5),
    difficulty: clamp(state.difficulty + 1, 1, 10),
  }
}

/**
 * Days until retrievability decays to the target. Note that `s` is not itself
 * the interval — at one stability period retrievability is 1/e, well below the
 * 0.90 target, so the interval is roughly a tenth of `s`.
 */
export function intervalDays(
  stabilityDays: number,
  targetRetention: number = TARGET_RETENTION,
): number {
  return Math.max(0, stabilityDays) * Math.log(1 / targetRetention)
}

/** The same interval, expressed against a supplied `now`. */
export function nextReviewAt(
  now: Date,
  stabilityDays: number,
  targetRetention: number = TARGET_RETENTION,
): Date {
  // Rounded to whole milliseconds: Date truncates anyway, and an explicit
  // round keeps the returned instant reproducible from the inputs.
  return new Date(
    now.getTime() + Math.round(intervalDays(stabilityDays, targetRetention) * 86_400_000),
  )
}
