/*
 * Curriculum phases. DATA_ML_TRACK.md §9.2.
 *
 * Pure data with no imports, so both the server repository and the client-side
 * command palette can use it. The palette previously took this list from
 * src/infra/db/track.ts, which would have pulled the database client into the
 * browser bundle.
 */

export const ALL_PHASES = [
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D6',
  'D7',
  'D8',
  // No D9. §5 has a capstone phase; §9.2 assigns no topics to it, so nothing
  // would become schedulable by activating it.
  'D10',
] as const

export type Phase = (typeof ALL_PHASES)[number]

/** What opening a phase actually turns on, in one line each. */
export const PHASE_LABEL: Record<Phase, string> = {
  E1: 'TypeScript, React, Next.js, testing',
  E2: 'Postgres, Redis, APIs, auth, reliability, security',
  E3: 'Networking, scale, distributed systems, cloud',
  E4: 'Evaluation, LLM core, retrieval, agents',
  E5: 'Communication, leadership, product',
  E6: 'Interview preparation',
  D0: 'Python for data, analytics SQL, wrangling',
  D1: 'Maths and statistics, visual first',
  D2: 'Exploratory analysis and visualisation',
  D3: 'Classical machine learning',
  D4: 'Time series and forecasting',
  D5: 'Deep learning',
  D6: 'Data engineering',
  D7: 'MLOps and model serving',
  D8: 'Transformers, LLMs, retrieval, evals',
  D10: 'ML interview preparation',
}

/*
 * ─── Ordering and progression (M-DS rulings 15 and 16) ──────────────────
 */

/** The phases of one track, in curriculum order. */
export const PHASES_BY_TRACK: Record<'ENGINEERING' | 'DATA_ML', readonly Phase[]> = {
  ENGINEERING: ALL_PHASES.filter((p) => p.startsWith('E')),
  DATA_ML: ALL_PHASES.filter((p) => p.startsWith('D')),
}

export const trackOfPhase = (phase: string): 'ENGINEERING' | 'DATA_ML' =>
  phase.startsWith('E') ? 'ENGINEERING' : 'DATA_ML'

/**
 * Active phases in curriculum order, grouped by track.
 *
 * Alphabetical order put D0 before E1, which reads as though the data track
 * comes first and puts D10 between D1 and D2. Curriculum order is the only
 * order that means anything here.
 */
export function groupActivePhases(active: readonly string[]): {
  readonly engineering: readonly string[]
  readonly dataMl: readonly string[]
} {
  const keep = (list: readonly Phase[]) => list.filter((p) => active.includes(p))
  return {
    engineering: keep(PHASES_BY_TRACK.ENGINEERING),
    dataMl: keep(PHASES_BY_TRACK.DATA_ML),
  }
}

/** e.g. "E1, E2 · D0". Empty string when nothing is active. */
export function formatActivePhases(active: readonly string[]): string {
  const { engineering, dataMl } = groupActivePhases(active)
  return [engineering.join(', '), dataMl.join(', ')].filter((s) => s !== '').join(' · ')
}

/** The phase immediately before this one in its own track, or null. */
export function predecessorOf(phase: string): Phase | null {
  const list = PHASES_BY_TRACK[trackOfPhase(phase)]
  const index = list.indexOf(phase as Phase)
  if (index <= 0) return null
  return list[index - 1] ?? null
}

/**
 * The phase that must be opened first, or null when this is normal progression.
 *
 * Ruling 16: confirm only when SKIPPING AHEAD. Opening E2 after E1 is one
 * keystroke; opening D5 while D4 has never been touched asks first, because
 * that is the move that quietly fills tomorrow with material you cannot do.
 *
 * Only the immediate predecessor is checked. Requiring the whole chain would
 * re-ask on every phase forever once one was deliberately skipped, and a
 * confirmation that always fires is one nobody reads.
 */
export function skipsAhead(phase: string, active: readonly string[]): Phase | null {
  const previous = predecessorOf(phase)
  if (previous === null) return null
  return active.includes(previous) ? null : previous
}
