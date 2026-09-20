/*
 * The mastery gate. Gates are docs/LEARNING_ENGINE.md §3.1.
 *
 * This module is the only thing permitted to decide a skill_state. It does not
 * write one: it returns a decision, and infrastructure persists it alongside a
 * mastery_transition row. Keeping the decision here and the write there is what
 * makes "nothing is promoted past DEVELOPING without an objective artifact" a
 * property of one testable function rather than a convention spread across
 * call sites.
 *
 * Pure by construction — no framework, no database, no clock. `now` is an
 * argument because a gate that reads the system clock cannot be tested against
 * a 30-day recall or a 60-day clean window without waiting for one.
 */

export type MasteryState =
  | 'UNASSESSED'
  | 'INTRODUCED'
  | 'DEVELOPING'
  | 'PRACTICAL'
  | 'INTERVIEW_READY'
  | 'MASTERED'

/** Ascending. Index doubles as rank, so comparisons are ordinal, not ad hoc. */
export const MASTERY_ORDER = [
  'UNASSESSED',
  'INTRODUCED',
  'DEVELOPING',
  'PRACTICAL',
  'INTERVIEW_READY',
  'MASTERED',
] as const satisfies readonly MasteryState[]

export const rankOf = (state: MasteryState): number => MASTERY_ORDER.indexOf(state)

export type Difficulty = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED'

export type Attempt = {
  readonly at: Date
  readonly successful: boolean
  readonly difficulty: Difficulty
}

/**
 * The kinds of objective artifact §3.1 recognises. An artifact is a fact the
 * system checked, never a self-report — that distinction is the whole reason
 * the PRACTICAL gate exists.
 */
export type ArtifactKind =
  | 'QUERY_RESULT'
  | 'EXPLAIN_PLAN'
  | 'MEASURED_IMPROVEMENT'
  | 'TESTS_PASS'
  | 'COVERAGE_DELTA'
  | 'DESIGN_CHECKLIST'
  | 'EVAL_HARNESS'

export type ObjectiveArtifact = {
  readonly kind: ArtifactKind
  readonly at: Date
}

/*
 * Some skills admit no objective artifact — communication is the example §3.1
 * gives. Those cap at PRACTICAL on in-app activity alone, and only a real
 * interview outcome lifts them further. The policy is data about the skill, so
 * it arrives as an input rather than being hardcoded here.
 */
export type ArtifactPolicy = 'OBJECTIVE_ARTIFACT_AVAILABLE' | 'NO_OBJECTIVE_ARTIFACT'

export type Evidence = {
  readonly attempts: readonly Attempt[]
  readonly artifacts: readonly ObjectiveArtifact[]
  /** Dates of successful explain-aloud evaluations. */
  readonly explainAloud: readonly Date[]
  /** Dates of outcomes from real interviews, never from the simulator. */
  readonly realInterviewResults: readonly Date[]
  readonly projectApplications: number
  readonly interviewQuestionsAnsweredWell: number
  readonly teachBacks: number
}

export type MasteryInput = {
  readonly now: Date
  readonly current: MasteryState
  readonly artifactPolicy: ArtifactPolicy
  /** States of this skill's prerequisites. Empty when it has none. */
  readonly prerequisiteStates: readonly MasteryState[]
  readonly evidence: Evidence
}

export type Requirement =
  | 'ONE_ATTEMPT'
  | 'TWO_ATTEMPTS'
  | 'ONE_SUCCESS_AT_BASIC'
  | 'OBJECTIVE_ARTIFACT'
  | 'THREE_SUCCESSES'
  | 'PREREQUISITES_PRACTICAL'
  | 'TWO_EXPLAIN_ALOUD'
  | 'EXPLAIN_ALOUD_SPACING'
  | 'PROJECT_APPLICATION'
  | 'INTERVIEW_QUESTION'
  | 'REAL_INTERVIEW_RESULT'
  | 'TEACH_BACK'
  | 'THIRTY_DAY_RECALL'
  | 'SIXTY_DAY_CLEAN'

export type Blocker = {
  readonly requirement: Requirement
  /** Written for a person reading a screen, not for a log. */
  readonly explanation: string
}

export type MasteryResult =
  | {
      readonly outcome: 'promote'
      readonly from: MasteryState
      readonly to: MasteryState
      readonly reasons: readonly string[]
      /** What now blocks the gate above `to`. Empty at MASTERED. */
      readonly blockedBy: readonly Blocker[]
    }
  | {
      readonly outcome: 'hold'
      readonly state: MasteryState
      readonly blockedBy: readonly Blocker[]
    }

const DAY_MS = 86_400_000
const daysBetween = (later: Date, earlier: Date) =>
  (later.getTime() - earlier.getTime()) / DAY_MS

type Check = {
  readonly requirement: Requirement
  readonly met: boolean
  readonly explanation: string
}

const successes = (evidence: Evidence) => evidence.attempts.filter((a) => a.successful)

/**
 * Whether a success at `difficulty` demonstrates competence at basic level.
 * A correct answer at ADVANCED necessarily clears BASIC, so this is inclusive
 * upward — reading §3.1's "≥1 correct at basic difficulty" as a floor rather
 * than an exact match.
 */
const clearsBasic = (attempt: Attempt) => attempt.successful

/** Requirements for entering each state, in the order §3.1 lists them. */
function checksFor(target: MasteryState, input: MasteryInput): readonly Check[] {
  const { evidence, prerequisiteStates, artifactPolicy, now } = input
  const succeeded = successes(evidence)

  switch (target) {
    case 'INTRODUCED':
      return [
        {
          requirement: 'ONE_ATTEMPT',
          met: evidence.attempts.length >= 1,
          explanation: 'Complete one learning attempt.',
        },
      ]

    case 'DEVELOPING':
      return [
        {
          requirement: 'TWO_ATTEMPTS',
          met: evidence.attempts.length >= 2,
          explanation: 'Complete at least two attempts.',
        },
        {
          requirement: 'ONE_SUCCESS_AT_BASIC',
          met: evidence.attempts.some(clearsBasic),
          explanation: 'Get one attempt right at basic difficulty.',
        },
      ]

    case 'PRACTICAL':
      return [
        {
          requirement: 'OBJECTIVE_ARTIFACT',
          // Waived only where no artifact is possible; that skill is then
          // capped at PRACTICAL by the INTERVIEW_READY gate below.
          met:
            artifactPolicy === 'NO_OBJECTIVE_ARTIFACT' || evidence.artifacts.length >= 1,
          explanation:
            'Produce one objective artifact — a passing test run, a correct query, a measured improvement.',
        },
        {
          requirement: 'THREE_SUCCESSES',
          met: succeeded.length >= 3,
          explanation: 'Succeed on at least three attempts.',
        },
        {
          requirement: 'PREREQUISITES_PRACTICAL',
          met: prerequisiteStates.every((state) => rankOf(state) >= rankOf('PRACTICAL')),
          explanation: 'Bring every prerequisite to PRACTICAL first.',
        },
      ]

    case 'INTERVIEW_READY': {
      const spaced =
        evidence.explainAloud.length >= 2 &&
        daysBetween(
          new Date(Math.max(...evidence.explainAloud.map((d) => d.getTime()))),
          new Date(Math.min(...evidence.explainAloud.map((d) => d.getTime()))),
        ) >= 7

      return [
        {
          requirement: 'TWO_EXPLAIN_ALOUD',
          met: evidence.explainAloud.length >= 2,
          explanation: 'Explain it aloud successfully twice.',
        },
        {
          requirement: 'EXPLAIN_ALOUD_SPACING',
          met: spaced,
          explanation: 'Space those two explanations at least seven days apart.',
        },
        {
          requirement: 'PROJECT_APPLICATION',
          met: evidence.projectApplications >= 1,
          explanation: 'Apply it to a real project once.',
        },
        {
          requirement: 'INTERVIEW_QUESTION',
          met: evidence.interviewQuestionsAnsweredWell >= 1,
          explanation: 'Answer one interview-context question well.',
        },
        {
          requirement: 'REAL_INTERVIEW_RESULT',
          /*
           * The deliberate asymmetry: where no objective artifact exists, only
           * a real interview outcome opens this gate. The simulator is not
           * allowed to certify you.
           */
          met:
            artifactPolicy === 'OBJECTIVE_ARTIFACT_AVAILABLE' ||
            evidence.realInterviewResults.length >= 1,
          explanation:
            'This skill has no objective artifact, so a real interview outcome is required.',
        },
      ]
    }

    case 'MASTERED': {
      const times = succeeded.map((a) => a.at.getTime()).sort((a, b) => a - b)
      const recalledLate = times.some((later, i) =>
        times.slice(0, i).some((earlier) => (later - earlier) / DAY_MS >= 30),
      )

      return [
        {
          requirement: 'TEACH_BACK',
          met: evidence.teachBacks >= 1,
          explanation: 'Teach it back once.',
        },
        {
          requirement: 'THIRTY_DAY_RECALL',
          met: recalledLate,
          explanation: 'Succeed again at least thirty days after an earlier success.',
        },
        {
          requirement: 'SIXTY_DAY_CLEAN',
          met: !evidence.attempts.some(
            (a) => !a.successful && daysBetween(now, a.at) <= 60,
          ),
          explanation: 'Go sixty days without a failed attempt.',
        },
      ]
    }

    // UNASSESSED is the default state; nothing is required to enter it.
    case 'UNASSESSED':
      return []
  }
}

/**
 * Walks upward from the current state, promoting through every gate whose
 * requirements are met and stopping at the first that is not.
 *
 * Never demotes. Decay moves a state down (§3.2) and is deliberately a separate
 * concern: this function sees evidence, not elapsed silence.
 */
export function evaluateMastery(input: MasteryInput): MasteryResult {
  const startRank = rankOf(input.current)
  let reachedRank = startRank
  const reasons: string[] = []
  let blockedBy: readonly Blocker[] = []

  for (let next = startRank + 1; next < MASTERY_ORDER.length; next++) {
    const target = MASTERY_ORDER[next]
    if (target === undefined) break

    const checks = checksFor(target, input)
    const unmet = checks.filter((c) => !c.met)

    if (unmet.length > 0) {
      blockedBy = unmet.map(({ requirement, explanation }) => ({
        requirement,
        explanation,
      }))
      break
    }

    reachedRank = next
    reasons.push(`${target}: ${checks.map((c) => c.explanation).join(' ')}`)
  }

  const reached = MASTERY_ORDER[reachedRank]
  if (reached === undefined) return { outcome: 'hold', state: input.current, blockedBy }

  if (reachedRank > startRank) {
    return { outcome: 'promote', from: input.current, to: reached, reasons, blockedBy }
  }

  return { outcome: 'hold', state: input.current, blockedBy }
}
