import { explain } from './explain'
import { rankCandidates } from './priority'
import { eligibleFormats, isEligibleForThread } from './threads'
import type {
  Candidate,
  DecayDecision,
  Intensity,
  Mission,
  MissionFormat,
  Plan,
  PlanInput,
  ReentryShape,
  ScoredNode,
  Thread,
} from './types'

/*
 * Plan construction. LEARNING_ENGINE.md §4.2, §4.3, §4.4.
 *
 * Greedy fill against the minute budget under five constraints. Greedy rather
 * than optimal on purpose: an optimal packing that takes a second to compute
 * and produces a different plan for a one-minute budget change is worse than a
 * predictable one you can reason about.
 */

const BUDGETS: Record<Intensity, { min: number; max: number }> = {
  LIGHT: { min: 30, max: 45 },
  NORMAL: { min: 60, max: 120 },
  DEEP: { min: 120, max: 240 },
}

export function budgetFor(intensity: Intensity): { min: number; max: number } {
  return BUDGETS[intensity]
}

/**
 * §4.4: more than seven days away is a ten-minute re-entry. One review, one
 * short mission, no catch-up. The point is to be easy to say yes to.
 */
export function reentryShapeFor(daysMissed: number): ReentryShape {
  if (daysMissed > 7) return { budgetMinutes: 10, reviews: 1, missions: 1 }
  return { budgetMinutes: 0, reviews: 0, missions: 0 }
}

/*
 * Difficulty is a property of the work, not of the score — which is what makes
 * "hardest first" a different ordering from "most important first", and why
 * ruling 6 had to decide between them.
 */
const FORMAT_DIFFICULTY: Record<MissionFormat, number> = {
  REVIEW: 1,
  EXPLAIN: 2,
  READ_CODE: 2,
  QUERY: 3,
  TEACH: 3,
  DEBUG: 4,
  BUILD: 4,
  DEFEND: 4,
  APPLY_TO_PROJECT: 4,
  DESIGN: 5,
  INTERVIEW: 5,
  /*
   * Data & ML formats. WATCH is the cheapest thing in the system — it is
   * deliberately a 10-minute unit, because the §8 videos are how a phase
   * starts and a 28-minute "watch" is really a lecture nobody begins.
   */
  WATCH: 1,
  MATH_BY_HAND: 3,
  VISUALIZE: 3,
  NOTEBOOK: 4,
}

const MINUTES_72H = 72 * 60 * 60 * 1000

/** §4.2 constraint 2: no repeat of a format used on this node within 72h. */
function formatIsFresh(node: ScoredNode, format: MissionFormat, now: Date): boolean {
  return !node.recentFormats.some(
    (used) => used.format === format && now.getTime() - used.at.getTime() < MINUTES_72H,
  )
}

/** Minutes for a mission, bounded by what is left and by the format's shape. */
function sizeFor(format: MissionFormat, remaining: number): number {
  const nominal = FORMAT_DIFFICULTY[format] * 6 + 4
  return Math.max(1, Math.min(nominal, remaining))
}

type Slot = { readonly thread: Thread; readonly minutes: number }

/**
 * §4.2 constraint 1: threads get their share before the dominant theme takes
 * the rest.
 *
 * LIGHT is exempt. §4.3 describes it as "review plus one short mission", and
 * four thread quotas inside a 30-minute budget leaves the theme nothing and
 * produces four two-minute fragments. A light day is not a compressed normal
 * day.
 */
function slotsFor(input: PlanInput): Slot[] {
  if (input.intensity === 'LIGHT') {
    /*
     * §4.3: "review plus one short mission". Both slots are real now — REVIEW
     * draws only from practised nodes (M-DS task b), so on a graph that is
     * still entirely UNASSESSED a review-only LIGHT day would be empty.
     */
    const review = Math.round(input.budgetMinutes * 0.4)
    return [
      { thread: 'REVIEW', minutes: review },
      { thread: 'THEME', minutes: input.budgetMinutes - review },
    ]
  }

  const slots: Slot[] = []
  let allocated = 0

  for (const quota of input.threadQuotas) {
    const minutes = Math.round(input.budgetMinutes * quota.share)
    if (minutes <= 0) continue
    slots.push({ thread: quota.thread, minutes })
    allocated += minutes
  }

  const remainder = input.budgetMinutes - allocated
  if (remainder > 0) slots.push({ thread: 'THEME', minutes: remainder })

  return slots
}

/** How many missions a plan may hold, after §4.4's reductions. */
function missionCap(input: PlanInput): number {
  if (input.daysMissed > 7) return 1
  if (input.intensity === 'LIGHT') return 2

  const full = input.intensity === 'DEEP' ? 8 : 5
  /*
   * §4.4: three to seven days missed produces a SMALLER plan. Smaller, not
   * deferred — the tail is dropped and never comes back as a queue.
   */
  return input.daysMissed >= 3 ? Math.max(2, Math.ceil(full / 2)) : full
}

function decayDecisionsFor(
  input: PlanInput,
  ranked: readonly ScoredNode[],
): DecayDecision[] {
  /*
   * §4.4 applies decay silently after a long absence. The scheduler is pure,
   * so it returns the decision and the mastery gate performs the write — the
   * audit row and the state change belong together, and neither belongs here.
   */
  if (input.daysMissed <= 7) return []

  return ranked
    .filter(
      (node) =>
        node.currentRank > 0 &&
        node.daysOverdue !== null &&
        node.daysOverdue >= node.halfLifeDays * 2,
    )
    .map((node) => ({
      skillId: node.skillId,
      demote: true,
      reason: `${node.daysOverdue}d since a successful attempt, past 2x the ${node.halfLifeDays}d half-life.`,
    }))
}

export function buildPlan(input: PlanInput): Plan {
  /*
   * §4.4: more than seven days away is a ten-minute re-entry, and that is a
   * cap on the budget itself — not only on the number of missions. A single
   * 22-minute mission is still a catch-up attempt.
   */
  const reentry = reentryShapeFor(input.daysMissed)
  const effective: PlanInput =
    reentry.budgetMinutes > 0
      ? { ...input, budgetMinutes: Math.min(input.budgetMinutes, reentry.budgetMinutes) }
      : input

  const ranked = rankCandidates(
    effective.candidates,
    effective.context,
    effective.weights,
  )
  const cap = missionCap(effective)
  const slots = slotsFor(effective)

  const chosen: Mission[] = []
  const formatCounts = new Map<MissionFormat, number>()
  const usedSkills = new Set<string>()
  let spent = 0
  let sequence = 0

  const canUseFormat = (format: MissionFormat) => (formatCounts.get(format) ?? 0) < 2

  for (const slot of slots) {
    if (chosen.length >= cap) break
    let slotSpent = 0

    for (const node of ranked) {
      if (chosen.length >= cap) break
      if (usedSkills.has(node.skillId)) continue
      if (slotSpent >= slot.minutes) break
      /*
       * The gate. Before M-DS task b every slot picked from the whole ranked
       * list, so a thread was a time slice with a label rather than a filter —
       * and an inactive phase was decoration.
       */
      if (!isEligibleForThread(node, slot.thread, effective.activePhases)) continue

      const format = eligibleFormats(node, slot.thread).find(
        (candidateFormat) =>
          canUseFormat(candidateFormat) &&
          formatIsFresh(node, candidateFormat, effective.now),
      )
      if (format === undefined) continue

      /*
       * §4.2 constraint 5: budget honesty. If the top node does not fit, take a
       * smaller piece of the same node rather than a different, cheaper one.
       * Swapping nodes silently answers a different question than the one the
       * ranking asked.
       */
      const remaining = Math.min(
        slot.minutes - slotSpent,
        effective.budgetMinutes - spent,
      )
      if (remaining <= 0) break

      const minutes = sizeFor(format, remaining)

      chosen.push({
        id: `${effective.now.toISOString().slice(0, 10)}-${sequence++}-${node.skillId}`,
        skillId: node.skillId,
        thread: slot.thread,
        format,
        minutes,
        difficulty: FORMAT_DIFFICULTY[format],
        primary: false,
        priority: node.priority,
        why: explain(node).map((clause) => clause.text),
      })

      usedSkills.add(node.skillId)
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1)
      slotSpent += minutes
      spent += minutes
    }
  }

  /*
   * §4.2 constraint 4: exactly one headline, and it is the highest-priority
   * mission — the plan's own answer to "what matters most today".
   *
   * Ruling 6: the primary leads the list even when it is not the hardest.
   * Constraint 3 wants hardest first for load shape, but a headline buried
   * third is not a headline, so the remainder carries the load shape instead.
   */
  const items = [...chosen]
  if (items.length > 0) {
    let best = 0
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.priority > items[best]!.priority) best = i
    }
    const [primary] = items.splice(best, 1)
    items.sort((a, b) => b.difficulty - a.difficulty)
    items.unshift({ ...primary!, primary: true })
  }

  return {
    intensity: effective.intensity,
    budgetMinutes: effective.budgetMinutes,
    primary: items[0] ?? EMPTY_MISSION,
    items,
    weightsUsed: effective.weights,
    generatedFor: effective.now,
    decayDecisions: decayDecisionsFor(effective, ranked),
  }
}

/*
 * A plan with no candidates is a legitimate outcome, not an error — so is a
 * budget too small to hold anything. §4.3's copy is "Done for today" either
 * way, and throwing here would turn a quiet day into a crash.
 */
const EMPTY_MISSION: Mission = {
  id: '',
  skillId: '',
  thread: 'THEME',
  format: 'REVIEW',
  minutes: 0,
  difficulty: 0,
  primary: false,
  priority: 0,
  why: [],
}

export type { Candidate }
