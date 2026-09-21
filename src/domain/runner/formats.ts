/*
 * The four Data & ML mission formats. DATA_ML_TRACK.md §4.3.
 *
 * Pure: no framework, no database, no clock, no network. What a format
 * requires, whether it produced an objective result, and what evidence it
 * leaves behind are all decided here, so the server action becomes plumbing
 * and this stays testable in milliseconds.
 *
 * Every rule below traces to §4.1's silent-failure rule. In web development
 * wrong code crashes; in this field it produces a confident number. So a video
 * is hidden before you answer (rule 4), a metric without a baseline does not
 * count as objective (rule 5), a notebook without a validity note is not
 * accepted (rule 6), and arithmetic is checked against a tolerance rather than
 * against how sure you felt.
 *
 * No Python runs here or anywhere else in this app — Colab and Kaggle already
 * do that, for free, with GPUs. NOTEBOOK takes the URL of work done there.
 */

export type Metric = {
  readonly value: number
  /** Never optional. A bare number is not a metric — §4.1 in one field. */
  readonly unit: string
}

export type Submission =
  | {
      readonly kind: 'WATCH'
      /** Null when the video was not one of §8's curated resources. */
      readonly resourceId: string | null
      readonly recall: string
    }
  | {
      readonly kind: 'NOTEBOOK'
      readonly url: string
      readonly result: Metric
      /** Null is allowed and costs the submission its objective status. */
      readonly baseline: Metric | null
      readonly validity: string
    }
  | {
      readonly kind: 'MATH_BY_HAND'
      readonly answer: number
      readonly working: string
    }
  | {
      readonly kind: 'VISUALIZE'
      readonly url: string
      readonly shows: string
      readonly hides: string
    }

/** The expected answer for a MATH_BY_HAND mission, authored with the mission. */
export type NumericCheck = {
  readonly expected: number
  /** Absolute, not relative. Zero means exact. */
  readonly tolerance: number
  readonly unit: string | null
  /** Shown only after the answer is submitted. */
  readonly worked: string
}

export type Validation =
  { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] }

/**
 * An evidence row a format wants written, in the ledger's own terms.
 *
 * `rawBody` is filled, `shareableBody` is not: DECISIONS.md §6.1 makes writing
 * the shareable form a separate, hand-written act. Nothing here is approved for
 * anything.
 */
export type EvidenceDraft = {
  readonly kind: 'CODE_ARTIFACT'
  /*
   * PRIVATE, not the column default EMPTYER_CONFIDENTIAL. M-DS ruling 13: a
   * notebook or a chart is your own work on public data, not an employer's
   * material — but it is still default-deny, and promoting an item to PUBLIC
   * stays an explicit per-item act on the evidence screen.
   */
  readonly classification: 'PRIVATE'
  readonly title: string
  readonly rawBody: string
  readonly shareableBody: null
  readonly aiAllowed: false
  readonly publishAllowed: false
  readonly verified: false
  readonly metricValue: number | null
  readonly metricUnit: string | null
  readonly metricSource: string | null
  readonly artifactUrl: string
}

/** Long enough to be an explanation rather than an acknowledgement. */
const MIN_RECALL = 20

const blank = (s: string): boolean => s.trim() === ''

const isUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    // http(s) only: a file:// or javascript: "artifact" is not one.
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== ''
  } catch {
    return false
  }
}

const metricErrors = (metric: Metric, label: string): string[] => {
  const errors: string[] = []
  if (!Number.isFinite(metric.value)) errors.push(`The ${label} metric must be a number.`)
  if (blank(metric.unit)) {
    errors.push(`The ${label} metric needs a unit — "0.83" on its own means nothing.`)
  }
  return errors
}

/** Every problem with a submission, not just the first. */
export function validateSubmission(submission: Submission): Validation {
  const errors: string[] = []

  switch (submission.kind) {
    case 'WATCH': {
      if (blank(submission.recall)) {
        errors.push(
          'Write what you remember before finishing — watching alone records nothing.',
        )
      } else if (submission.recall.trim().length < MIN_RECALL) {
        errors.push(
          'That recall is too short to be an explanation. §4.2 rule 4: close it, then explain it.',
        )
      }
      break
    }

    case 'NOTEBOOK': {
      if (!isUrl(submission.url)) {
        errors.push('Paste the notebook URL — the Colab or Kaggle share link.')
      }
      errors.push(...metricErrors(submission.result, 'result'))
      if (submission.baseline !== null) {
        errors.push(...metricErrors(submission.baseline, 'baseline'))
      }
      if (blank(submission.validity)) {
        errors.push(
          'How do you know this is valid? Split strategy, leakage audit, baseline.',
        )
      }
      break
    }

    case 'MATH_BY_HAND': {
      if (!Number.isFinite(submission.answer)) errors.push('Enter a numeric answer.')
      break
    }

    case 'VISUALIZE': {
      if (!isUrl(submission.url)) errors.push('Paste a URL for the image or the chart.')
      if (blank(submission.shows)) errors.push('Say what the chart shows.')
      if (blank(submission.hides)) {
        errors.push(
          'Say what a worse chart would hide. A chart with no stated failure mode is a picture, not an argument.',
        )
      }
      break
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

/**
 * Whether the answer is within tolerance.
 *
 * The epsilon is not decoration: with `tolerance: 0` and an expected value
 * that came out of arithmetic, `Math.abs(0.30000000000000004 - 0.3) <= 0` is
 * false, and the user would be told they got 0.3 wrong.
 */
export function checkNumericAnswer(answer: number, check: NumericCheck): boolean {
  if (!Number.isFinite(answer) || !Number.isFinite(check.expected)) return false

  const difference = Math.abs(answer - check.expected)
  const epsilon =
    Math.max(Math.abs(answer), Math.abs(check.expected), 1) * Number.EPSILON * 8
  return difference <= check.tolerance + epsilon
}

/**
 * The objective verdict, or null for "not checked".
 *
 * Null and false are different claims and the mastery gate reads them
 * differently: null is "this format admits no objective check here", false is
 * "it was checked and it failed". Returning false for an unchecked attempt
 * would be inventing a judgement.
 */
export function objectivePassedFor(
  submission: Submission,
  check: NumericCheck | null,
): boolean | null {
  switch (submission.kind) {
    case 'MATH_BY_HAND':
      // Nothing authors a NumericCheck yet — problem authoring is M3.
      return check === null ? null : checkNumericAnswer(submission.answer, check)

    case 'NOTEBOOK':
      /*
       * §4.2 rule 5. The objective claim is that a baseline comparison was
       * made — not that the result beat it, which is unknowable generically:
       * lower is better for RMSE, higher for AUC, and nothing here knows
       * which one "ROC AUC" is.
       */
      return submission.baseline === null ? null : true

    case 'WATCH':
    case 'VISUALIZE':
      // §4.3 calls these an explanation and an artifact. Judging either needs
      // the AI gateway, which is M3.
      return null
  }
}

/**
 * The evidence a format leaves behind, or null.
 *
 * Only NOTEBOOK writes, and it uses the same URL as both `artifact_url` and
 * `metric_source` — which is the honest answer to "where did this number come
 * from?" and is what makes the row satisfy `metric_requires_source` rather
 * than merely happen to.
 */
export function evidenceDraftFor(submission: Submission): EvidenceDraft | null {
  /*
   * VISUALIZE writes too (M-DS ruling 12). §4.3 calls its output an Artifact,
   * and a chart with a public URL is exactly that. It carries no metric, so it
   * is never an objective artifact — the caller reads `objectivePassedFor`,
   * which returns null for this format.
   */
  if (submission.kind === 'VISUALIZE') {
    return {
      kind: 'CODE_ARTIFACT',
      classification: 'PRIVATE',
      title: `Chart: ${submission.shows.trim().slice(0, 80)}`,
      rawBody: [
        `What it shows: ${submission.shows.trim()}`,
        '',
        `What a worse chart would hide: ${submission.hides.trim()}`,
      ].join('\n'),
      shareableBody: null,
      aiAllowed: false,
      publishAllowed: false,
      verified: false,
      metricValue: null,
      metricUnit: null,
      metricSource: null,
      artifactUrl: submission.url,
    }
  }

  if (submission.kind !== 'NOTEBOOK') return null

  const baseline =
    submission.baseline === null
      ? 'No baseline recorded — this result is not an objective artifact (§4.2 rule 5).'
      : `Baseline: ${submission.baseline.value} ${submission.baseline.unit}.`

  return {
    kind: 'CODE_ARTIFACT',
    classification: 'PRIVATE',
    title: `Notebook: ${submission.result.value} ${submission.result.unit}`,
    rawBody: [
      `Result: ${submission.result.value} ${submission.result.unit}.`,
      baseline,
      '',
      'How do I know this is valid?',
      submission.validity.trim(),
    ].join('\n'),
    shareableBody: null,
    aiAllowed: false,
    publishAllowed: false,
    // "Verified" is a claim someone checked the artifact. Submitting it is not
    // checking it.
    verified: false,
    metricValue: submission.result.value,
    metricUnit: submission.result.unit,
    metricSource: submission.url,
    artifactUrl: submission.url,
  }
}
