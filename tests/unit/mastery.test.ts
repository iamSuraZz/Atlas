import { describe, expect, it } from 'vitest'
import {
  evaluateMastery,
  type Evidence,
  type MasteryInput,
  type MasteryResult,
  type MasteryState,
} from '@/domain/skills/mastery'

/*
 * Gates are from docs/LEARNING_ENGINE.md §3.1. Every promotion has a test that
 * it happens and a test for each individual requirement that blocks it, because
 * a gate that can only be shown to open is not a gate.
 *
 * All dates are fixed and `now` is injected — the domain layer never reads a
 * clock, so these tests cannot rot into time-dependent flakes.
 */

const NOW = new Date('2026-06-01T00:00:00Z')
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const noEvidence: Evidence = {
  attempts: [],
  artifacts: [],
  explainAloud: [],
  realInterviewResults: [],
  projectApplications: 0,
  interviewQuestionsAnsweredWell: 0,
  teachBacks: 0,
}

const input = (
  evidence: Partial<Evidence>,
  overrides: Partial<MasteryInput> = {},
): MasteryInput => ({
  now: NOW,
  current: 'UNASSESSED',
  artifactPolicy: 'OBJECTIVE_ARTIFACT_AVAILABLE',
  prerequisiteStates: [],
  evidence: { ...noEvidence, ...evidence },
  ...overrides,
})

const attempt = (
  days: number,
  successful: boolean,
  difficulty: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' = 'BASIC',
) => ({ at: daysBefore(days), successful, difficulty })

/** Enough for PRACTICAL, so the higher gates can be tested in isolation. */
const practicalEvidence: Partial<Evidence> = {
  attempts: [attempt(40, true), attempt(35, true), attempt(30, true)],
  artifacts: [{ kind: 'TESTS_PASS', at: daysBefore(35) }],
}

const interviewReadyEvidence: Partial<Evidence> = {
  ...practicalEvidence,
  explainAloud: [daysBefore(30), daysBefore(10)],
  projectApplications: 1,
  interviewQuestionsAnsweredWell: 1,
}

/*
 * Read unconditionally: a promotion still reports what blocks the *next* gate,
 * which is what lets a screen say "you are DEVELOPING; PRACTICAL needs an
 * objective artifact" rather than just showing a state.
 */
const blockers = (result: MasteryResult) => result.blockedBy.map((b) => b.requirement)

const reaches = (result: MasteryResult): MasteryState =>
  result.outcome === 'promote' ? result.to : result.state

describe('UNASSESSED to INTRODUCED', () => {
  it('promotes on one completed attempt, successful or not', () => {
    const result = evaluateMastery(input({ attempts: [attempt(1, false)] }))
    expect(reaches(result)).toBe('INTRODUCED')
  })

  it('holds with no attempts at all', () => {
    const result = evaluateMastery(input({}))
    expect(result.outcome).toBe('hold')
    expect(reaches(result)).toBe('UNASSESSED')
    expect(blockers(result)).toContain('ONE_ATTEMPT')
  })
})

describe('INTRODUCED to DEVELOPING', () => {
  it('promotes on two attempts with one success at basic difficulty', () => {
    const result = evaluateMastery(
      input({ attempts: [attempt(2, false), attempt(1, true)] }),
    )
    expect(reaches(result)).toBe('DEVELOPING')
  })

  it('holds at INTRODUCED on a single successful attempt', () => {
    const result = evaluateMastery(input({ attempts: [attempt(1, true)] }))
    expect(reaches(result)).toBe('INTRODUCED')
    expect(blockers(result)).toContain('TWO_ATTEMPTS')
  })

  it('holds when both attempts failed', () => {
    const result = evaluateMastery(
      input({ attempts: [attempt(2, false), attempt(1, false)] }),
    )
    expect(reaches(result)).toBe('INTRODUCED')
    expect(blockers(result)).toContain('ONE_SUCCESS_AT_BASIC')
  })
})

describe('DEVELOPING to PRACTICAL', () => {
  it('promotes with an artifact, three successes and satisfied prerequisites', () => {
    const result = evaluateMastery(
      input(practicalEvidence, { prerequisiteStates: ['PRACTICAL', 'MASTERED'] }),
    )
    expect(reaches(result)).toBe('PRACTICAL')
  })

  it('holds without an objective artifact, which is the anti-hallucination gate', () => {
    const result = evaluateMastery(input({ ...practicalEvidence, artifacts: [] }))
    expect(reaches(result)).toBe('DEVELOPING')
    expect(blockers(result)).toContain('OBJECTIVE_ARTIFACT')
  })

  it('holds on only two successful attempts', () => {
    const result = evaluateMastery(
      input({ ...practicalEvidence, attempts: [attempt(40, true), attempt(35, true)] }),
    )
    expect(reaches(result)).toBe('DEVELOPING')
    expect(blockers(result)).toContain('THREE_SUCCESSES')
  })

  it('holds when any prerequisite is below PRACTICAL', () => {
    const result = evaluateMastery(
      input(practicalEvidence, { prerequisiteStates: ['PRACTICAL', 'DEVELOPING'] }),
    )
    expect(reaches(result)).toBe('DEVELOPING')
    expect(blockers(result)).toContain('PREREQUISITES_PRACTICAL')
  })

  it('reaches PRACTICAL without an artifact when none is possible for the skill', () => {
    const result = evaluateMastery(
      input(
        { ...practicalEvidence, artifacts: [] },
        { artifactPolicy: 'NO_OBJECTIVE_ARTIFACT' },
      ),
    )
    expect(reaches(result)).toBe('PRACTICAL')
  })
})

describe('PRACTICAL to INTERVIEW_READY', () => {
  it('promotes with two spaced explain-alouds, an application and an interview question', () => {
    const result = evaluateMastery(input(interviewReadyEvidence))
    expect(reaches(result)).toBe('INTERVIEW_READY')
  })

  it('holds on a single explain-aloud', () => {
    const result = evaluateMastery(
      input({ ...interviewReadyEvidence, explainAloud: [daysBefore(10)] }),
    )
    expect(reaches(result)).toBe('PRACTICAL')
    expect(blockers(result)).toContain('TWO_EXPLAIN_ALOUD')
  })

  it('holds when both explain-alouds fall inside seven days', () => {
    const result = evaluateMastery(
      input({
        ...interviewReadyEvidence,
        explainAloud: [daysBefore(12), daysBefore(10)],
      }),
    )
    expect(reaches(result)).toBe('PRACTICAL')
    expect(blockers(result)).toContain('EXPLAIN_ALOUD_SPACING')
  })

  it('holds without a real project application', () => {
    const result = evaluateMastery(
      input({ ...interviewReadyEvidence, projectApplications: 0 }),
    )
    expect(reaches(result)).toBe('PRACTICAL')
    expect(blockers(result)).toContain('PROJECT_APPLICATION')
  })

  it('holds without an interview-context question answered well', () => {
    const result = evaluateMastery(
      input({ ...interviewReadyEvidence, interviewQuestionsAnsweredWell: 0 }),
    )
    expect(reaches(result)).toBe('PRACTICAL')
    expect(blockers(result)).toContain('INTERVIEW_QUESTION')
  })

  it('caps an artifact-less skill at PRACTICAL, so the simulator cannot certify you', () => {
    const result = evaluateMastery(
      input(
        { ...interviewReadyEvidence, artifacts: [] },
        { artifactPolicy: 'NO_OBJECTIVE_ARTIFACT' },
      ),
    )
    expect(reaches(result)).toBe('PRACTICAL')
    expect(blockers(result)).toContain('REAL_INTERVIEW_RESULT')
  })

  it('unlocks an artifact-less skill on a real interview result', () => {
    const result = evaluateMastery(
      input(
        {
          ...interviewReadyEvidence,
          artifacts: [],
          realInterviewResults: [daysBefore(5)],
        },
        { artifactPolicy: 'NO_OBJECTIVE_ARTIFACT' },
      ),
    )
    expect(reaches(result)).toBe('INTERVIEW_READY')
  })
})

describe('INTERVIEW_READY to MASTERED', () => {
  const masteredEvidence: Partial<Evidence> = {
    ...interviewReadyEvidence,
    attempts: [
      attempt(120, true),
      attempt(80, true),
      attempt(70, true),
      attempt(35, true),
    ],
    teachBacks: 1,
  }

  it('promotes with a teach-back, a 30-day recall and a clean 60 days', () => {
    const result = evaluateMastery(input(masteredEvidence))
    expect(reaches(result)).toBe('MASTERED')
  })

  it('holds without a teach-back', () => {
    const result = evaluateMastery(input({ ...masteredEvidence, teachBacks: 0 }))
    expect(reaches(result)).toBe('INTERVIEW_READY')
    expect(blockers(result)).toContain('TEACH_BACK')
  })

  it('holds when no success is 30 or more days after an earlier success', () => {
    const result = evaluateMastery(
      input({
        ...masteredEvidence,
        attempts: [attempt(40, true), attempt(35, true), attempt(30, true)],
      }),
    )
    expect(reaches(result)).toBe('INTERVIEW_READY')
    expect(blockers(result)).toContain('THIRTY_DAY_RECALL')
  })

  it('holds when an attempt failed inside 60 days', () => {
    const result = evaluateMastery(
      input({
        ...masteredEvidence,
        attempts: [...(masteredEvidence.attempts ?? []), attempt(10, false)],
      }),
    )
    expect(reaches(result)).toBe('INTERVIEW_READY')
    expect(blockers(result)).toContain('SIXTY_DAY_CLEAN')
  })
})

describe('the gate itself', () => {
  it('promotes no further than the evidence supports', () => {
    const result = evaluateMastery(input({ attempts: [attempt(1, true)] }))
    expect(reaches(result)).toBe('INTRODUCED')
  })

  it('reports a hold when the current state already matches the evidence', () => {
    const result = evaluateMastery(
      input({ attempts: [attempt(1, false)] }, { current: 'INTRODUCED' }),
    )
    expect(result.outcome).toBe('hold')
  })

  it('never demotes, because decay is a separate concern (LEARNING_ENGINE §3.2)', () => {
    const result = evaluateMastery(input({}, { current: 'PRACTICAL' }))
    expect(result.outcome).toBe('hold')
    expect(reaches(result)).toBe('PRACTICAL')
  })

  it('reports every unmet requirement, not only the first', () => {
    const result = evaluateMastery(
      input({ attempts: [attempt(2, false), attempt(1, true)] }),
    )
    expect(blockers(result).length).toBeGreaterThan(1)
  })

  it('carries the reasons for a promotion so the UI can explain it', () => {
    const result = evaluateMastery(input({ attempts: [attempt(1, false)] }))
    expect(result.outcome === 'promote' && result.reasons.length).toBeGreaterThan(0)
  })
})
