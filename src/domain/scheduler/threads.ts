import type { Candidate, MissionFormat, Thread, ThreadQuota, Track } from './types'

/*
 * Which nodes a thread may draw from, and what it may ask of them.
 * DATA_ML_TRACK.md §3.2 and §10.3.
 *
 * Until M-DS task b the slot loop picked from the whole ranked list regardless
 * of thread, so "System design: 10%" meant ten percent of the budget spent on
 * whatever happened to rank highest. This module is where a thread stops being
 * a label on a time slice and starts being a filter.
 *
 * Two of the rules pull against each other on purpose:
 *
 *   THEME and DATA_ML draw only from ACTIVE phases, so the curriculum arrives
 *   in order and week one is not offered transformers.
 *
 *   REVIEW draws from any practised node, phase or not. Closing a phase must
 *   not make you forget what you learned in it — it only stops new work there.
 */

const DATA_ML_CATEGORIES: ReadonlySet<string> = new Set([
  'MATH_STATS',
  'DATA_SCIENCE',
  'MACHINE_LEARNING',
  'DATA_ENGINEERING',
  'MLOPS',
])

const ENGINEERING_CATEGORIES: ReadonlySet<string> = new Set([
  'ENGINEERING_CORE',
  'BACKEND',
  // Not DATA_SCIENCE. The engineering graph has had a category called DATA —
  // postgres, redis, modelling — since long before the data track existed.
  'DATA',
  'SYSTEMS',
  'QUALITY',
  'AI_ENGINEERING',
  'PROFESSIONAL',
])

/**
 * Which curriculum a category belongs to.
 *
 * Throws on an unknown category rather than defaulting. A new category that
 * silently lands in ENGINEERING would be offered in week one; one that lands
 * in DATA_ML would eat the data quota. Both are worse than a loud failure at
 * the moment someone adds a sixth category.
 */
export function trackOf(category: string): Track {
  if (DATA_ML_CATEGORIES.has(category)) return 'DATA_ML'
  if (ENGINEERING_CATEGORIES.has(category)) return 'ENGINEERING'
  throw new Error(
    `Unknown skill category: ${category}. Add it to threads.ts and decide which ` +
      `track it belongs to — the scheduler will not guess.`,
  )
}

/*
 * The `interview` topic spans three threads, so it is split by node rather
 * than by topic. §2's interview leaves are dsa-patterns, system-design-
 * framework, behavioural-stories, project-narrative, code-comprehension and
 * negotiation — every one of them is placed below.
 */
/*
 * The two interview nodes stay: they are the "explain the pattern out loud"
 * half of DSA, which the `dsa` subtree does not cover. Everything under `dsa`
 * joins them (M-DS ruling 6), which is what turns a 15% weekly quota from a
 * rotation between two drills into an actual rotation.
 */
const DSA_TOPIC = 'dsa'

const DSA_NODES: ReadonlySet<string> = new Set([
  'interview/dsa-patterns',
  'interview/code-comprehension',
])

const SYSTEM_DESIGN_NODES: ReadonlySet<string> = new Set([
  'interview/system-design-framework',
])

const COMMUNICATION_NODES: ReadonlySet<string> = new Set([
  'interview/behavioural-stories',
  'interview/project-narrative',
  'interview/negotiation',
])

const COMMUNICATION_TOPICS: ReadonlySet<string> = new Set([
  'communication',
  'leadership',
  'product',
])

/** §3.2, Phase 1 — until the job switch, NORMAL ≈ 11 h/week. */
export const PHASE_1_QUOTAS: readonly ThreadQuota[] = [
  { thread: 'DSA', share: 0.15 },
  { thread: 'SYSTEM_DESIGN', share: 0.1 },
  { thread: 'COMMUNICATION', share: 0.07 },
  { thread: 'REVIEW', share: 0.08 },
  { thread: 'DATA_ML', share: 0.3 },
  /*
   * THEME is absent on purpose: it takes whatever the others leave, which is
   * the 30% §3.2 gives the dominant engineering theme. Listing it here would
   * allocate it twice — once as a quota and once as the remainder.
   */
]

const inActivePhase = (node: Candidate, activePhases: readonly string[]): boolean =>
  // A null phase means nobody has decided where this node belongs. Offering it
  // would be the scheduler deciding instead.
  node.phase !== null && activePhases.includes(node.phase)

/** Whether `thread` may draw `node` today. */
export function isEligibleForThread(
  node: Candidate,
  thread: Thread,
  activePhases: readonly string[],
): boolean {
  switch (thread) {
    case 'THEME':
      return trackOf(node.category) === 'ENGINEERING' && inActivePhase(node, activePhases)

    case 'DATA_ML':
      return trackOf(node.category) === 'DATA_ML' && inActivePhase(node, activePhases)

    /*
     * The next three ignore phase entirely, and that is the point rather than
     * an oversight: interview sits in E6 and communication in E5, so a phase
     * check would make all three unreachable until the final phases — while
     * §3.2 budgets them 32% of every week from day one.
     */
    case 'DSA':
      return node.topic === DSA_TOPIC || DSA_NODES.has(node.skillId)

    case 'SYSTEM_DESIGN':
      return node.category === 'SYSTEMS' || SYSTEM_DESIGN_NODES.has(node.skillId)

    case 'COMMUNICATION':
      return COMMUNICATION_TOPICS.has(node.topic) || COMMUNICATION_NODES.has(node.skillId)

    case 'REVIEW':
      // Anything with something to remember. currentRank 0 is UNASSESSED.
      return node.currentRank > 0
  }
}

const ENGINEERING_THREAD_FORMATS: Record<
  Exclude<Thread, 'DATA_ML'>,
  readonly MissionFormat[]
> = {
  DSA: ['BUILD', 'EXPLAIN'],
  SYSTEM_DESIGN: ['DESIGN', 'DEFEND'],
  COMMUNICATION: ['EXPLAIN', 'TEACH'],
  REVIEW: ['REVIEW'],
  THEME: ['QUERY', 'DEBUG', 'BUILD', 'READ_CODE', 'EXPLAIN', 'DESIGN'],
}

const MATHS_FORMATS: readonly MissionFormat[] = ['WATCH', 'MATH_BY_HAND', 'EXPLAIN']
const TOOL_AND_ML_FORMATS: readonly MissionFormat[] = ['NOTEBOOK', 'WATCH', 'EXPLAIN']

/**
 * The formats a thread may ask of a node, in preference order.
 *
 * Ordered, not a set: the slot loop takes the first that rotation still allows,
 * so the head of the list is what you get on a normal day and the tail is what
 * you get when the head was used in the last 72h.
 *
 * The visualization list is an interpretation worth naming. §10.3 says
 * "visualization → VISUALIZE" and nothing else, which read literally gives
 * those six nodes exactly one format and therefore makes them unschedulable
 * for 72h after a single use. VISUALIZE leads, and the rest of the
 * DATA_SCIENCE list follows as a fallback.
 */
export function eligibleFormats(
  node: Candidate,
  thread: Thread,
): readonly MissionFormat[] {
  if (thread !== 'DATA_ML') return ENGINEERING_THREAD_FORMATS[thread]

  // Reached only for a DATA_ML slot; an engineering node has no business here
  // and gets nothing rather than a data format it cannot use.
  if (trackOf(node.category) !== 'DATA_ML') return []

  if (node.topic === 'visualization') return ['VISUALIZE', ...TOOL_AND_ML_FORMATS]
  if (node.category === 'MATH_STATS') return MATHS_FORMATS
  return TOOL_AND_ML_FORMATS
}
