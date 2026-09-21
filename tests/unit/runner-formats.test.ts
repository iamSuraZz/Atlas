import { describe, expect, it } from 'vitest'
import {
  checkNumericAnswer,
  evidenceDraftFor,
  objectivePassedFor,
  validateSubmission,
  type NumericCheck,
  type Submission,
} from '@/domain/runner/formats'

/*
 * Executable specification for the four Data & ML mission formats.
 * M-DS task c; DATA_ML_TRACK.md §4.1, §4.2 rules 4-6, and §4.3.
 *
 * Written before the implementation. The rule underneath all of it is §4.1's
 * silent-failure rule: in this field wrong work produces a confident number
 * rather than a crash, so the formats are shaped to make the invisible failure
 * visible — a video you cannot re-watch while answering, a metric that is
 * meaningless without its baseline, an arithmetic answer checked against a
 * tolerance rather than against your own feeling about it.
 */

const watch = (
  over: Partial<Extract<Submission, { kind: 'WATCH' }>> = {},
): Submission => ({
  kind: 'WATCH',
  resourceId: '3blue1brown-essence-of-linear-algebra',
  recall: 'A determinant is the factor by which a transformation scales area.',
  ...over,
})

const notebook = (
  over: Partial<Extract<Submission, { kind: 'NOTEBOOK' }>> = {},
): Submission => ({
  kind: 'NOTEBOOK',
  url: 'https://colab.research.google.com/drive/abc123',
  result: { value: 0.83, unit: 'ROC AUC' },
  baseline: { value: 0.5, unit: 'ROC AUC' },
  validity:
    'Stratified 5-fold, no target leakage: the label column is dropped before fitting.',
  ...over,
})

const math = (
  over: Partial<Extract<Submission, { kind: 'MATH_BY_HAND' }>> = {},
): Submission => ({
  kind: 'MATH_BY_HAND',
  answer: 1.96,
  working: 'z for 95% two-sided',
  ...over,
})

const visualize = (
  over: Partial<Extract<Submission, { kind: 'VISUALIZE' }>> = {},
): Submission => ({
  kind: 'VISUALIZE',
  url: 'https://gist.github.com/me/chart.png',
  shows: 'PM2.5 by month, one line per city, Diwali spike annotated.',
  hides: 'A bar of annual means would hide the seasonality entirely.',
  ...over,
})

const check: NumericCheck = {
  expected: 1.96,
  tolerance: 0.01,
  unit: null,
  worked: 'The 97.5th percentile of the standard normal is 1.959964…',
}

const errorsOf = (s: Submission): readonly string[] => {
  const result = validateSubmission(s)
  return result.ok ? [] : result.errors
}

// ───────────────────────────────────────────────────────────────────────────
describe('WATCH — §4.2 rule 4, "watch, close, explain"', () => {
  it('accepts a recall', () => {
    expect(validateSubmission(watch()).ok).toBe(true)
  })

  it('requires the recall — watching alone writes nothing', () => {
    expect(errorsOf(watch({ recall: '' }))).toHaveLength(1)
    expect(errorsOf(watch({ recall: '   ' }))).toHaveLength(1)
  })

  it('rejects a recall too short to be an explanation', () => {
    // "ok" is not "explain what you learned without rewinding".
    expect(errorsOf(watch({ recall: 'ok' }))[0]).toMatch(/recall/i)
  })

  it('does not require a resource id — a video may be watched off-list', () => {
    expect(validateSubmission(watch({ resourceId: null })).ok).toBe(true)
  })

  it('admits no objective check', () => {
    // §4.3: WATCH produces an "Explanation attempt". Judging it needs the AI
    // gateway, which is M3. Null is the honest answer, not false.
    expect(objectivePassedFor(watch(), null)).toBeNull()
  })

  it('writes no evidence', () => {
    expect(evidenceDraftFor(watch())).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('NOTEBOOK — §4.2 rules 5 and 6', () => {
  it('accepts a complete submission', () => {
    expect(validateSubmission(notebook()).ok).toBe(true)
  })

  it('requires a URL, and requires it to be one', () => {
    expect(errorsOf(notebook({ url: '' }))).not.toHaveLength(0)
    expect(errorsOf(notebook({ url: 'my notebook' }))[0]).toMatch(/url/i)
    expect(errorsOf(notebook({ url: 'ftp://x/y' }))[0]).toMatch(/url/i)
  })

  it('requires the validity note — §4.2 rule 6', () => {
    expect(errorsOf(notebook({ validity: '' }))[0]).toMatch(/valid/i)
  })

  it('requires a unit on every metric — a bare number is not a metric', () => {
    expect(errorsOf(notebook({ result: { value: 0.83, unit: '' } }))[0]).toMatch(/unit/i)
  })

  it('rejects a non-finite metric value', () => {
    expect(
      errorsOf(notebook({ result: { value: Number.NaN, unit: 'AUC' } })),
    ).not.toHaveLength(0)
    expect(
      errorsOf(notebook({ result: { value: Number.POSITIVE_INFINITY, unit: 'AUC' } })),
    ).not.toHaveLength(0)
  })

  it('is objective only when BOTH metrics are present', () => {
    expect(objectivePassedFor(notebook(), null)).toBe(true)
    expect(objectivePassedFor(notebook({ baseline: null }), null)).toBeNull()
  })

  it('accepts a submission with no baseline, but marks it non-objective', () => {
    /*
     * §4.2 rule 5 says always beat a dumb baseline. The runner does not refuse
     * the work — refusing would just lose the record — but a result with
     * nothing to compare it against does not count as an objective artifact,
     * which is what the mastery gate reads.
     */
    const noBaseline = notebook({ baseline: null })
    expect(validateSubmission(noBaseline).ok).toBe(true)
    expect(objectivePassedFor(noBaseline, null)).toBeNull()
  })

  it('does not judge whether the result BEAT the baseline', () => {
    // Direction is unknowable generically: lower is better for RMSE, higher
    // for AUC. The objective claim is that a comparison was made at all.
    const worse = notebook({ result: { value: 0.2, unit: 'ROC AUC' } })
    expect(objectivePassedFor(worse, null)).toBe(true)
  })

  it('writes evidence with the URL as BOTH artifact and metric source', () => {
    const draft = evidenceDraftFor(notebook())
    expect(draft).not.toBeNull()
    expect(draft!.artifactUrl).toBe('https://colab.research.google.com/drive/abc123')
    expect(draft!.metricSource).toBe('https://colab.research.google.com/drive/abc123')
    expect(draft!.metricValue).toBe(0.83)
    expect(draft!.metricUnit).toBe('ROC AUC')
  })

  it('puts the validity note and the baseline in the raw body', () => {
    const draft = evidenceDraftFor(notebook())!
    expect(draft.rawBody).toContain('no target leakage')
    expect(draft.rawBody).toContain('0.5')
  })

  it('never pre-approves the evidence it writes', () => {
    /*
     * DECISIONS.md §6.1: AI and publish approval are separate, explicit acts.
     * A runner that set them would make every notebook submission a silent
     * approval of its own contents.
     */
    const draft = evidenceDraftFor(notebook())!
    expect(draft.aiAllowed).toBe(false)
    expect(draft.publishAllowed).toBe(false)
    expect(draft.shareableBody).toBeNull()
    expect(draft.verified).toBe(false)
  })

  it('satisfies metric_requires_source by construction', () => {
    // The database CHECK would reject value-without-source. This asserts the
    // draft can never be the thing that trips it.
    const draft = evidenceDraftFor(notebook())!
    if (draft.metricValue !== null) {
      expect(draft.metricSource).not.toBeNull()
      expect(draft.metricUnit).not.toBeNull()
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('MATH_BY_HAND — §4.3 "Objective pass/fail"', () => {
  it('accepts a numeric answer', () => {
    expect(validateSubmission(math()).ok).toBe(true)
  })

  it('rejects a non-finite answer', () => {
    expect(errorsOf(math({ answer: Number.NaN }))).not.toHaveLength(0)
    expect(errorsOf(math({ answer: Number.POSITIVE_INFINITY }))).not.toHaveLength(0)
  })

  it('passes inside the tolerance, inclusive at the boundary', () => {
    expect(checkNumericAnswer(1.96, check)).toBe(true)
    expect(checkNumericAnswer(1.95, check)).toBe(true)
    expect(checkNumericAnswer(1.97, check)).toBe(true)
  })

  it('fails outside the tolerance', () => {
    expect(checkNumericAnswer(1.9, check)).toBe(false)
    expect(checkNumericAnswer(2.5, check)).toBe(false)
    expect(checkNumericAnswer(-1.96, check)).toBe(false)
  })

  it('survives floating point at the boundary', () => {
    // 0.1 + 0.2 !== 0.3. A naive <= on the raw difference flakes here.
    expect(checkNumericAnswer(0.3, { ...check, expected: 0.1 + 0.2, tolerance: 0 })).toBe(
      true,
    )
  })

  it('treats zero tolerance as exact', () => {
    const exact = { ...check, expected: 42, tolerance: 0 }
    expect(checkNumericAnswer(42, exact)).toBe(true)
    expect(checkNumericAnswer(42.01, exact)).toBe(false)
  })

  it('computes objective_passed from the check', () => {
    expect(objectivePassedFor(math({ answer: 1.96 }), check)).toBe(true)
    expect(objectivePassedFor(math({ answer: 3 }), check)).toBe(false)
  })

  it('is null when no expected answer was authored', () => {
    /*
     * Nothing generates a NumericCheck yet — problem authoring is M3. Null
     * says "not checked", which is true; false would say "you got it wrong",
     * which would be a fabricated judgement.
     */
    expect(objectivePassedFor(math(), null)).toBeNull()
  })

  it('writes no evidence', () => {
    expect(evidenceDraftFor(math())).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('VISUALIZE', () => {
  it('accepts a complete submission', () => {
    expect(validateSubmission(visualize()).ok).toBe(true)
  })

  it('requires the image or link', () => {
    expect(errorsOf(visualize({ url: '' }))).not.toHaveLength(0)
    expect(errorsOf(visualize({ url: 'a chart' }))[0]).toMatch(/url/i)
  })

  it('requires what it shows', () => {
    expect(errorsOf(visualize({ shows: '' }))[0]).toMatch(/shows/i)
  })

  it('requires what a worse chart would hide', () => {
    // The whole point of the format. A chart with no stated failure mode is a
    // picture, not an argument about the data.
    expect(errorsOf(visualize({ hides: '' }))[0]).toMatch(/hide/i)
  })

  it('reports both missing halves at once rather than one at a time', () => {
    expect(errorsOf(visualize({ shows: '', hides: '' }))).toHaveLength(2)
  })

  it('admits no objective check', () => {
    expect(objectivePassedFor(visualize(), null)).toBeNull()
  })

  it('writes evidence with the URL as the artifact — M-DS ruling 12', () => {
    const draft = evidenceDraftFor(visualize())
    expect(draft).not.toBeNull()
    expect(draft!.artifactUrl).toBe('https://gist.github.com/me/chart.png')
  })

  it('carries no metric, so it can never be an objective artifact', () => {
    const draft = evidenceDraftFor(visualize())!
    expect(draft.metricValue).toBeNull()
    expect(draft.metricSource).toBeNull()
    // The caller writes evidence_skill.objective from objectivePassedFor,
    // which is null here — so the row lands as objective false.
    expect(objectivePassedFor(visualize(), null)).not.toBe(true)
  })

  it('keeps both halves of the argument in the raw body', () => {
    const draft = evidenceDraftFor(visualize())!
    expect(draft.rawBody).toContain('Diwali spike')
    expect(draft.rawBody).toContain('seasonality')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('across all four formats', () => {
  const all: Submission[] = [watch(), notebook(), math(), visualize()]

  it('every valid submission produces a non-empty response to record', () => {
    for (const s of all) {
      expect(validateSubmission(s).ok).toBe(true)
    }
  })

  it('NOTEBOOK and VISUALIZE write evidence; WATCH and MATH_BY_HAND do not', () => {
    const writers = all.filter((s) => evidenceDraftFor(s) !== null).map((s) => s.kind)
    expect(writers).toEqual(['NOTEBOOK', 'VISUALIZE'])
  })

  it('every draft is PRIVATE and unapproved — M-DS ruling 13', () => {
    for (const submission of all) {
      const draft = evidenceDraftFor(submission)
      if (draft === null) continue
      expect(draft.classification).toBe('PRIVATE')
      expect(draft.aiAllowed).toBe(false)
      expect(draft.publishAllowed).toBe(false)
      expect(draft.verified).toBe(false)
    }
  })

  it('no format claims an objective pass it did not compute', () => {
    // MATH_BY_HAND with a check, and NOTEBOOK with both metrics. Nothing else.
    expect(objectivePassedFor(watch(), check)).toBeNull()
    expect(objectivePassedFor(visualize(), check)).toBeNull()
  })

  it('validation never throws, whatever it is handed', () => {
    const hostile: Submission[] = [
      watch({ recall: '\u0000' }),
      notebook({ url: 'https://' }),
      math({ answer: -0 }),
      visualize({ shows: '\n\n', hides: '\t' }),
    ]
    for (const s of hostile) expect(() => validateSubmission(s)).not.toThrow()
  })
})
