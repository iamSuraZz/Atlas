'use client'

import { Input } from '@/components/ui/input'
import type { LearnResource } from '@/infra/db/resources'

/*
 * The four Data & ML work surfaces. DATA_ML_TRACK.md §4.3.
 *
 * Presentation only — every rule about what is required, what counts as
 * objective and what gets written lives in src/domain/runner/formats.ts. These
 * components collect strings and hand them up.
 *
 * NOTHING HERE RUNS PYTHON, and nothing should. Colab and Kaggle already do it
 * for free with GPUs; building an in-browser runner is the app eating the
 * learning again (§10, "Not building").
 */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
        {label}
      </span>
      {hint !== undefined && <span className="text-step-0 text-text-3">{hint}</span>}
      {children}
    </label>
  )
}

const TEXTAREA =
  'rounded-ctl border-border-control bg-surface text-step-1 w-full border p-3'

export function Area({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={TEXTAREA}
    />
  )
}

/* ── WATCH ──────────────────────────────────────────────────────────────── */

/**
 * The resource, before it is taken away.
 *
 * §4.2 rule 4: "A video only counts if you close it and explain what you
 * learned without rewinding." So this is shown, and then it is gone — not
 * collapsed, not behind a toggle. A re-openable panel is a rewind button with
 * extra steps.
 */
export function WatchResources({
  resources,
  onHide,
}: {
  resources: readonly LearnResource[]
  onHide: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {resources.length === 0 ? (
        <p className="text-step-1 text-text-2">
          No curated resource is linked to this skill yet. Watch something you trust, then
          hide this and explain it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((r) => (
            <li
              key={r.id}
              className="rounded-ctl border-border bg-surface flex flex-col gap-1 border p-3"
            >
              <span className="text-step-0 text-text-3 font-mono">{r.kind}</span>
              {r.url === null ? (
                <span className="text-step-1">{r.title}</span>
              ) : (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-step-1 text-accent underline underline-offset-2"
                >
                  {r.title}
                </a>
              )}
              {r.note !== null && (
                <span className="text-step-0 text-text-3">{r.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onHide}
        className="rounded-ctl border-accent text-step-1 text-accent self-start border px-4 py-2"
      >
        I&rsquo;ve watched it — hide this and let me explain
      </button>
      <p className="text-step-0 text-text-3">
        This cannot be reopened. That is the format: watch, close, explain.
      </p>
    </div>
  )
}

/* ── NOTEBOOK ───────────────────────────────────────────────────────────── */

export type MetricFields = { value: string; unit: string }

export function NotebookFields({
  url,
  setUrl,
  result,
  setResult,
  baseline,
  setBaseline,
  validity,
  setValidity,
}: {
  url: string
  setUrl: (v: string) => void
  result: MetricFields
  setResult: (v: MetricFields) => void
  baseline: MetricFields
  setBaseline: (v: MetricFields) => void
  validity: string
  setValidity: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-step-0 text-text-3">
        Work in Colab or Kaggle — Atlas runs no Python, on purpose. Paste the share link
        when you are done.
      </p>

      <Field label="Notebook URL">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://colab.research.google.com/…"
          inputMode="url"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your result" hint="The number your work produced.">
          <div className="flex gap-2">
            <Input
              value={result.value}
              onChange={(e) => setResult({ ...result, value: e.target.value })}
              placeholder="0.83"
              inputMode="decimal"
              aria-label="Result value"
            />
            <Input
              value={result.unit}
              onChange={(e) => setResult({ ...result, unit: e.target.value })}
              placeholder="ROC AUC"
              aria-label="Result unit"
            />
          </div>
        </Field>

        <Field label="Dumb baseline" hint="Mean, majority class, yesterday's value.">
          <div className="flex gap-2">
            <Input
              value={baseline.value}
              onChange={(e) => setBaseline({ ...baseline, value: e.target.value })}
              placeholder="0.50"
              inputMode="decimal"
              aria-label="Baseline value"
            />
            <Input
              value={baseline.unit}
              onChange={(e) => setBaseline({ ...baseline, unit: e.target.value })}
              placeholder="ROC AUC"
              aria-label="Baseline unit"
            />
          </div>
        </Field>
      </div>

      <Field
        label="How do I know this is valid?"
        hint="Split strategy, leakage audit, baseline comparison, error analysis."
      >
        <Area
          value={validity}
          onChange={setValidity}
          rows={5}
          placeholder="Stratified 5-fold. Label dropped before fitting. Beats the majority-class baseline by…"
        />
      </Field>

      <p className="text-step-0 text-text-3">
        Without a baseline this is recorded, but it does not count as an objective
        artifact — §4.2 rule 5.
      </p>
    </div>
  )
}

/* ── MATH_BY_HAND ───────────────────────────────────────────────────────── */

export function MathFields({
  answer,
  setAnswer,
  working,
  setWorking,
  unit,
}: {
  answer: string
  setAnswer: (v: string) => void
  working: string
  setWorking: (v: string) => void
  unit: string | null
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-step-0 text-text-3">
        Do it on paper. Enter the number, then check it in NumPy afterwards — not before.
      </p>

      <Field label={unit === null ? 'Answer' : `Answer (${unit})`}>
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="1.96"
          inputMode="decimal"
          className="font-mono"
        />
      </Field>

      <Field label="Working" hint="Optional. Useful to yourself a month from now.">
        <Area value={working} onChange={setWorking} rows={6} />
      </Field>
    </div>
  )
}

/** Shown only after the attempt has been recorded. */
export function WorkedAnswer({
  passed,
  worked,
  expected,
  unit,
}: {
  passed: boolean | null
  worked: string
  expected: number
  unit: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <p
        className={
          passed === null
            ? 'text-step-1 text-text-2'
            : passed
              ? 'text-step-1 text-ok'
              : 'text-step-1 text-fail'
        }
      >
        {passed === null
          ? 'Recorded. No expected answer was authored for this mission, so nothing was checked.'
          : passed
            ? 'Correct, within tolerance.'
            : 'Not within tolerance.'}
      </p>
      <p className="text-step-1">
        Expected: <span className="font-mono">{expected}</span>
        {unit !== null && ` ${unit}`}
      </p>
      <div className="rounded-ctl border-border bg-surface border p-3">
        <p className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
          Worked answer
        </p>
        <p className="text-step-1 text-text-2 mt-2 whitespace-pre-wrap">{worked}</p>
      </div>
    </div>
  )
}

/* ── VISUALIZE ──────────────────────────────────────────────────────────── */

export function VisualizeFields({
  url,
  setUrl,
  shows,
  setShows,
  hides,
  setHides,
}: {
  url: string
  setUrl: (v: string) => void
  shows: string
  setShows: (v: string) => void
  hides: string
  setHides: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Image or link" hint="A gist, a Streamlit app, an uploaded PNG.">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
        />
      </Field>

      <Field label="What it shows">
        <Area value={shows} onChange={setShows} rows={4} />
      </Field>

      <Field
        label="What a worse chart would hide"
        hint="The point of the format. A chart with no stated failure mode is a picture, not an argument."
      >
        <Area value={hides} onChange={setHides} rows={4} />
      </Field>
    </div>
  )
}
