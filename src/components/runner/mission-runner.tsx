'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  runQuery,
  submitMission,
  type RunResult,
} from '@/app/(runner)/mission/[id]/actions'
import type { QueryOutcome } from '@/infra/sandbox/neon-branch'

/*
 * UX_PLAN §3.2. Full-screen, chrome removed. Left: brief and context. Right:
 * the work surface. Timer visible but showing ELAPSED, never remaining —
 * remaining creates panic, which is the opposite of what a 25-minute mission
 * needs.
 *
 * Three formats in M2: EXPLAIN, REVIEW, QUERY. DEBUG, BUILD and DESIGN arrive
 * when the scheduler actually selects them.
 */

export type RunnerMission = {
  readonly id: string
  readonly skillId: string
  readonly format: 'EXPLAIN' | 'REVIEW' | 'QUERY'
  readonly title: string
  readonly brief: string
  readonly why: readonly string[]
  readonly estMinutes: number
}

const PROMPT: Record<RunnerMission['format'], string> = {
  EXPLAIN: 'Explain it in your own words, as if to a colleague who has not seen it.',
  REVIEW: 'Recall it before you look anything up. Write what you remember.',
  QUERY:
    'Write one statement. It runs against a throwaway branch, so it cannot break anything.',
}

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

export function MissionRunner({ mission }: { mission: RunnerMission }) {
  const router = useRouter()
  /*
   * The ref is written inside the effect and read only from the interval
   * callback and from event handlers — never during render, which is what the
   * React compiler forbids. setState happens in the interval callback, which is
   * the subscription pattern effects are for.
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
  const [stage, setStage] = useState<'working' | 'reflecting'>('working')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const objective = run?.kind === 'ran' ? run.outcome : null

  function execute() {
    setError(null)
    startTransition(async () => setRun(await runQuery(mission.id, response)))
  }

  function finish() {
    if (confidence === null) {
      setError('Pick a confidence before finishing.')
      return
    }

    startTransition(async () => {
      const result = await submitMission({
        missionId: mission.id,
        response,
        // Read in an event handler, never during render.
        durationSeconds:
          startedAt.current === null
            ? seconds
            : Math.round((Date.now() - startedAt.current) / 1000),
        objectiveResult: objective,
        reflection: { confidence, note: note.trim() === '' ? null : note.trim() },
      })

      if (!result.ok) {
        setError(result.message ?? 'Could not save.')
        return
      }
      router.push('/today')
    })
  }

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
            placeholder={mission.format === 'QUERY' ? 'select 1;' : 'Write here…'}
          />

          {mission.format === 'QUERY' && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <Button onClick={execute} disabled={pending || response.trim() === ''}>
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
        </section>
      </div>

      <footer className="border-border flex flex-col gap-4 border-t pt-4">
        {stage === 'working' ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={response.trim() === ''}
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

            <div className="flex justify-end">
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
