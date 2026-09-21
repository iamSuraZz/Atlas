'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  MathFields,
  NotebookFields,
  VisualizeFields,
  WatchResources,
  WorkedAnswer,
  type MetricFields,
} from '@/components/runner/data-ml-fields'
import {
  revealWorkedAnswer,
  runQuery,
  submitDataMlMission,
  submitMission,
  type RunResult,
} from '@/app/(runner)/mission/[id]/actions'
import type { Submission } from '@/domain/runner/formats'
import type { LearnResource } from '@/infra/db/resources'
import type { QueryOutcome } from '@/infra/sandbox/neon-branch'

/*
 * UX_PLAN §3.2. Full-screen, chrome removed. Left: brief and context. Right:
 * the work surface. Timer visible but showing ELAPSED, never remaining —
 * remaining creates panic, which is the opposite of what a 25-minute mission
 * needs.
 *
 * Seven formats: EXPLAIN, REVIEW and QUERY from M2; WATCH, NOTEBOOK,
 * MATH_BY_HAND and VISUALIZE from M-DS task c. DEBUG, BUILD and DESIGN arrive
 * when the scheduler actually selects them.
 *
 * No Python runs in this app. Colab and Kaggle do it for free, with GPUs.
 */

export type RunnerFormat =
  'EXPLAIN' | 'REVIEW' | 'QUERY' | 'WATCH' | 'NOTEBOOK' | 'MATH_BY_HAND' | 'VISUALIZE'

export type RunnerMission = {
  readonly id: string
  readonly skillId: string
  readonly format: RunnerFormat
  readonly title: string
  readonly brief: string
  readonly why: readonly string[]
  readonly estMinutes: number
  /** MATH_BY_HAND only, and only the part that is safe to send. */
  readonly answerUnit: string | null
}

const PROMPT: Record<RunnerFormat, string> = {
  EXPLAIN: 'Explain it in your own words, as if to a colleague who has not seen it.',
  REVIEW: 'Recall it before you look anything up. Write what you remember.',
  QUERY:
    'Write one statement. It runs against a throwaway branch, so it cannot break anything.',
  WATCH: 'Watch it, close it, then explain what you learned without rewinding.',
  NOTEBOOK: 'Work in Colab or Kaggle. Bring back the link, your metric and a baseline.',
  MATH_BY_HAND: 'Compute or derive it on paper. Verify in NumPy afterwards, not before.',
  VISUALIZE: 'Make the chart. Then say what it shows, and what a worse one would hide.',
}

const DATA_ML: ReadonlySet<RunnerFormat> = new Set([
  'WATCH',
  'NOTEBOOK',
  'MATH_BY_HAND',
  'VISUALIZE',
])

function Elapsed({ seconds }: { seconds: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <span
      aria-label="Elapsed time"
      className="text-step-1 text-text-3 font-mono tabular-nums"
    >
      {mm}:{ss}
    </span>
  )
}

function QueryResult({ outcome }: { outcome: QueryOutcome }) {
  if (!outcome.ok) {
    return (
      <div role="alert" className="flex flex-col gap-1">
        <p className="text-step-0 text-fail font-mono">Failed in {outcome.ms}ms</p>
        <pre className="rounded-ctl bg-surface text-step-0 text-text-2 overflow-x-auto p-3 font-mono">
          {outcome.error}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-step-0 text-ok font-mono">
        {outcome.rows.length} row{outcome.rows.length === 1 ? '' : 's'} in {outcome.ms}ms
      </p>
      {outcome.columns.length > 0 && (
        <div className="rounded-ctl border-border overflow-x-auto border">
          <table className="text-step-0 w-full font-mono">
            <thead>
              <tr className="border-border border-b">
                {outcome.columns.map((c) => (
                  <th key={c} className="text-text-2 px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outcome.rows.slice(0, 50).map((row, i) => (
                <tr key={i} className="border-border border-b last:border-b-0">
                  {row.map((cell, j) => (
                    <td key={j} className="text-text-3 px-3 py-1.5">
                      {cell === null ? 'NULL' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const metric = (fields: MetricFields) => ({
  value: Number(fields.value),
  unit: fields.unit.trim(),
})

const blank = (fields: MetricFields) =>
  fields.value.trim() === '' && fields.unit.trim() === ''

type Revealed = { worked: string; expected: number; unit: string | null }

export function MissionRunner({
  mission,
  resources = [],
}: {
  mission: RunnerMission
  resources?: readonly LearnResource[]
}) {
  const router = useRouter()
  /*
   * The ref is written inside the effect and read only from the interval
   * callback and from event handlers — never during render, which is what the
   * React compiler forbids.
   */
  const startedAt = useRef<number | null>(null)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    startedAt.current = Date.now()
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const [response, setResponse] = useState('')
  const [run, setRun] = useState<RunResult | null>(null)
  const [stage, setStage] = useState<'working' | 'reflecting' | 'revealed'>('working')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<readonly string[]>([])
  const [pending, startTransition] = useTransition()

  // WATCH. Once hidden, never shown again — that IS the format (§4.2 rule 4).
  const [watchHidden, setWatchHidden] = useState(false)

  // NOTEBOOK
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<MetricFields>({ value: '', unit: '' })
  const [baseline, setBaseline] = useState<MetricFields>({ value: '', unit: '' })
  const [validity, setValidity] = useState('')

  // MATH_BY_HAND
  const [answer, setAnswer] = useState('')
  const [working, setWorking] = useState('')
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [passed, setPassed] = useState<boolean | null>(null)

  // VISUALIZE
  const [shows, setShows] = useState('')
  const [hides, setHides] = useState('')

  const objective = run?.kind === 'ran' ? run.outcome : null
  const isDataMl = DATA_ML.has(mission.format)

  function execute() {
    setError(null)
    startTransition(async () => setRun(await runQuery(mission.id, response)))
  }

  function buildSubmission(): Submission {
    switch (mission.format) {
      case 'NOTEBOOK':
        return {
          kind: 'NOTEBOOK',
          url: url.trim(),
          result: metric(result),
          baseline: blank(baseline) ? null : metric(baseline),
          validity,
        }
      case 'MATH_BY_HAND':
        return { kind: 'MATH_BY_HAND', answer: Number(answer), working }
      case 'VISUALIZE':
        return { kind: 'VISUALIZE', url: url.trim(), shows, hides }
      default:
        return { kind: 'WATCH', resourceId: resources[0]?.id ?? null, recall: response }
    }
  }

  /** Enough is filled in to move to the reflection. Domain does the real check. */
  function readyToFinish(): boolean {
    switch (mission.format) {
      case 'NOTEBOOK':
        return url.trim() !== '' && result.value.trim() !== '' && validity.trim() !== ''
      case 'MATH_BY_HAND':
        return answer.trim() !== '' && Number.isFinite(Number(answer))
      case 'VISUALIZE':
        return url.trim() !== '' && shows.trim() !== '' && hides.trim() !== ''
      case 'WATCH':
        return watchHidden && response.trim() !== ''
      default:
        return response.trim() !== ''
    }
  }

  function finish() {
    if (confidence === null) {
      setError('Pick a confidence before finishing.')
      return
    }
    setError(null)
    setErrors([])

    const durationSeconds =
      startedAt.current === null
        ? seconds
        : Math.round((Date.now() - startedAt.current) / 1000)
    const reflection = { confidence, note: note.trim() === '' ? null : note.trim() }

    startTransition(async () => {
      if (!isDataMl) {
        const done = await submitMission({
          missionId: mission.id,
          response,
          durationSeconds,
          objectiveResult: objective,
          reflection,
        })
        if (!done.ok) {
          setError(done.message ?? 'Could not save.')
          return
        }
        router.push('/today')
        return
      }

      const submission = buildSubmission()
      const done = await submitDataMlMission({
        missionId: mission.id,
        submission,
        durationSeconds,
        reflection,
      })

      if (!done.ok) {
        setErrors(done.errors ?? [])
        setError(done.errors === undefined ? (done.message ?? 'Could not save.') : null)
        return
      }

      /*
       * The worked answer is fetched only now. The page is a server component,
       * so anything it sent would already be in the browser — shipping the
       * answer with the question and hiding it in CSS would be theatre.
       */
      if (mission.format === 'MATH_BY_HAND') {
        const reveal = await revealWorkedAnswer(mission.id)
        if (reveal !== null) {
          setRevealed(reveal)
          /*
           * The server's verdict, not a second opinion. Recomputing the
           * tolerance here would duplicate domain logic in a place nothing
           * tests, and the two would disagree the first time either changed.
           */
          setPassed(done.objectivePassed ?? null)
          setStage('revealed')
          return
        }
      }

      router.push('/today')
    })
  }

  const showWatchResources = mission.format === 'WATCH' && !watchHidden

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-step-0 text-text-3 font-mono">
            {mission.skillId} · {mission.format}
          </p>
          <h1 className="text-step-2 font-medium">{mission.title}</h1>
        </div>
        <div className="flex items-baseline gap-4">
          <Elapsed seconds={seconds} />
          <span className="text-step-0 text-text-3 font-mono">
            ~{mission.estMinutes} min
          </span>
        </div>
      </header>

      <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left: brief and context. */}
        <aside className="flex flex-col gap-4">
          <p className="text-step-1 text-text-2">{PROMPT[mission.format]}</p>
          {mission.brief !== '' && (
            <p className="text-step-1 text-text-2">{mission.brief}</p>
          )}
          {mission.why.length > 0 && (
            <div className="border-border flex flex-col gap-1 border-t pt-4">
              <p className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
                Why this
              </p>
              <p className="text-step-0 text-text-3">{mission.why.join(' · ')}</p>
            </div>
          )}
        </aside>

        {/* Right: the work surface. */}
        <section className="flex flex-col gap-3">
          {stage === 'revealed' && revealed !== null ? (
            <WorkedAnswer
              passed={passed}
              worked={revealed.worked}
              expected={revealed.expected}
              unit={revealed.unit}
            />
          ) : showWatchResources ? (
            <WatchResources resources={resources} onHide={() => setWatchHidden(true)} />
          ) : mission.format === 'NOTEBOOK' ? (
            <NotebookFields
              url={url}
              setUrl={setUrl}
              result={result}
              setResult={setResult}
              baseline={baseline}
              setBaseline={setBaseline}
              validity={validity}
              setValidity={setValidity}
            />
          ) : mission.format === 'MATH_BY_HAND' ? (
            <MathFields
              answer={answer}
              setAnswer={setAnswer}
              working={working}
              setWorking={setWorking}
              unit={mission.answerUnit}
            />
          ) : mission.format === 'VISUALIZE' ? (
            <VisualizeFields
              url={url}
              setUrl={setUrl}
              shows={shows}
              setShows={setShows}
              hides={hides}
              setHides={setHides}
            />
          ) : (
            <>
              <label htmlFor="response" className="sr-only">
                Your response
              </label>
              <textarea
                id="response"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                spellCheck={mission.format !== 'QUERY'}
                className={cn(
                  'rounded-ctl border-border-control bg-surface text-step-1 min-h-64 w-full flex-1 border p-3',
                  mission.format === 'QUERY' && 'font-mono',
                )}
                placeholder={
                  mission.format === 'QUERY'
                    ? 'select 1;'
                    : mission.format === 'WATCH'
                      ? 'What did you learn? No rewinding.'
                      : 'Write here…'
                }
              />

              {mission.format === 'QUERY' && (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-end">
                    <Button
                      onClick={execute}
                      disabled={pending || response.trim() === ''}
                    >
                      {pending ? 'Running…' : 'Run'}
                    </Button>
                  </div>
                  {run?.kind === 'unavailable' && (
                    <p role="alert" className="text-step-0 text-fail">
                      {run.message}
                    </p>
                  )}
                  {objective !== null && <QueryResult outcome={objective} />}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <footer className="border-border flex flex-col gap-4 border-t pt-4">
        {stage === 'revealed' ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => router.push('/today')}>
              Back to today
            </Button>
          </div>
        ) : stage === 'working' ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!readyToFinish()}
              onClick={() => setStage('reflecting')}
            >
              Done →
            </Button>
          </div>
        ) : (
          /*
           * The 5-second reflection. Two controls, one of them optional. It
           * feeds the scheduler and takes almost no time, which is why it
           * actually gets done.
           */
          <div className="flex flex-col gap-3">
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">Confidence</legend>
              <span className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
                Confidence
              </span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={confidence === n}
                  onClick={() => setConfidence(n)}
                  className={cn(
                    'rounded-ctl text-step-1 h-9 w-9 border font-mono transition-colors duration-150 ease-out',
                    confidence === n
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-control text-text-2 hover:text-text',
                  )}
                >
                  {n}
                </button>
              ))}
            </fieldset>

            <Input
              aria-label="One line, optional"
              placeholder="One line, optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {error !== null && (
              <p role="alert" className="text-step-0 text-fail">
                {error}
              </p>
            )}
            {errors.length > 0 && (
              <ul role="alert" className="flex flex-col gap-1">
                {errors.map((message) => (
                  <li key={message} className="text-step-0 text-fail">
                    {message}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between">
              <Button onClick={() => setStage('working')} disabled={pending}>
                ← Back
              </Button>
              <Button variant="primary" onClick={finish} disabled={pending}>
                {pending ? 'Saving…' : 'Finish'}
              </Button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}
