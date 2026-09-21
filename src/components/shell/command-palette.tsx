'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { readActivePhases, toggleActivePhase } from '@/app/(app)/phases/actions'
import { PHASES_BY_TRACK, PHASE_LABEL, skipsAhead } from '@/lib/phases'

/*
 * Deliberately not cmdk. Radix Dialog already supplies the parts that are hard
 * to get right — focus trap, focus restoration, Escape, scroll lock,
 * aria-modal — and the command list is short enough to filter with `includes`.
 *
 * One command so far: change which phases are active. It lives here rather
 * than on a settings screen because it is the setting you change most and the
 * one you want to change without losing your place.
 */

type View = 'commands' | 'phases'

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('commands')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<readonly string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when opening a phase would skip its predecessor. Ruling 16.
  const [confirming, setConfirming] = useState<{ phase: string; after: string } | null>(
    null,
  )
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // metaKey on macOS, ctrlKey elsewhere — read from the event rather than
      // sniffing the platform, which gets external keyboards wrong.
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setView('commands')
      setQuery('')
      setError(null)
    }
  }

  function openPhases() {
    setView('phases')
    setQuery('')
    startTransition(async () => {
      const result = await readActivePhases()
      if (result.ok) setActive(result.active)
      else setError(result.message)
    })
  }

  function request(phase: string) {
    /*
     * Deactivating never asks, and neither does normal progression. The one
     * case worth a question is opening a phase whose predecessor has never
     * been opened — the move that quietly fills tomorrow with material you
     * cannot do yet.
     */
    const turningOn = active !== null && !active.includes(phase)
    const skipped = turningOn ? skipsAhead(phase, active ?? []) : null

    if (skipped !== null) {
      setConfirming({ phase, after: skipped })
      return
    }
    toggle(phase)
  }

  function toggle(phase: string) {
    setConfirming(null)
    startTransition(async () => {
      const result = await toggleActivePhase(phase)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setActive(result.active)
      setError(null)
      // The server revalidated /skills and /today; this refreshes whichever
      // one the user is looking at right now.
      router.refresh()
    })
  }

  const matches = (phase: string) =>
    `${phase} ${PHASE_LABEL[phase as keyof typeof PHASE_LABEL] ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())

  // Grouped by track and in curriculum order, so the list reads as the path it
  // is rather than as an alphabetised set. Ruling 15.
  const groups = [
    { track: 'Engineering', phases: PHASES_BY_TRACK.ENGINEERING.filter(matches) },
    { track: 'Data & ML', phases: PHASES_BY_TRACK.DATA_ML.filter(matches) },
  ].filter((group) => group.phases.length > 0)

  return (
    <Dialog open={open} onOpenChange={reset}>
      {/*
       * DialogTrigger, not a bare button with onClick. Radix restores focus to
       * the registered trigger on close; without one, closing drops focus to
       * <body> and a keyboard user loses their place entirely.
       */}
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="palette-trigger"
          className="rounded-ctl border-border-control text-step-0 text-text-3 hover:text-text-2 border px-3 py-1.5 font-mono transition-colors duration-150 ease-out"
        >
          <span className="sr-only">Open command palette</span>
          <span aria-hidden="true">⌘K</span>
        </button>
      </DialogTrigger>

      <DialogContent
        aria-describedby="palette-hint"
        className="top-[20%] translate-y-0 p-0"
      >
        <div className="border-border border-b p-3">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <Input
            data-testid="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === 'commands' ? 'Search commands…' : 'Filter phases…'}
            aria-label={view === 'commands' ? 'Search commands' : 'Filter phases'}
          />
        </div>

        {view === 'commands' ? (
          <div className="flex flex-col p-2">
            <DialogDescription id="palette-hint" className="sr-only">
              Commands
            </DialogDescription>
            <button
              type="button"
              data-testid="command-phases"
              onClick={openPhases}
              className="rounded-ctl hover:bg-raised flex items-baseline gap-3 px-3 py-2.5 text-left transition-colors duration-150 ease-out"
            >
              <span className="text-step-1 flex-1">Change active phases</span>
              <span className="text-step-0 text-text-3 font-mono">
                what the scheduler may offer
              </span>
            </button>
          </div>
        ) : (
          <div className="flex max-h-80 flex-col overflow-y-auto p-2">
            <DialogDescription
              id="palette-hint"
              className="text-step-0 text-text-3 px-3 pb-2"
            >
              Active phases scope SKILLS and decide what tomorrow&rsquo;s plan may
              contain. Review and interview threads ignore them.
            </DialogDescription>

            {active === null ? (
              <p className="text-step-0 text-text-3 px-3 py-2">Loading…</p>
            ) : groups.length === 0 ? (
              <p className="text-step-0 text-text-3 px-3 py-2">No phase matches.</p>
            ) : (
              groups.map((group) => (
                <div key={group.track} className="flex flex-col">
                  <p className="text-step-0 text-text-3 px-3 pt-3 pb-1 font-mono tracking-widest uppercase">
                    {group.track}
                  </p>
                  {group.phases.map((phase) => {
                    const on = active.includes(phase)
                    return (
                      <button
                        key={phase}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={pending}
                        onClick={() => request(phase)}
                        className="rounded-ctl hover:bg-raised flex items-baseline gap-3 px-3 py-2 text-left transition-colors duration-150 ease-out"
                      >
                        <span
                          aria-hidden="true"
                          className={on ? 'text-accent' : 'text-text-3'}
                        >
                          {on ? '●' : '○'}
                        </span>
                        <span className="text-step-1 w-10 font-mono">{phase}</span>
                        <span className="text-step-0 text-text-3 flex-1">
                          {PHASE_LABEL[phase]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}

            {confirming !== null && (
              <div
                role="alertdialog"
                aria-label="Confirm skipping ahead"
                className="rounded-ctl border-accent m-3 flex flex-col gap-2 border p-3"
              >
                <p className="text-step-0 text-text-2">
                  {confirming.after} is not active, so opening {confirming.phase} skips
                  ahead. Tomorrow&rsquo;s plan may offer material you have not built up
                  to.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="confirm-skip"
                    onClick={() => toggle(confirming.phase)}
                    className="rounded-ctl border-accent bg-accent text-accent-fg text-step-0 border px-3 py-1.5 font-mono"
                  >
                    Open {confirming.phase} anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-ctl border-border-control text-text-2 text-step-0 border px-3 py-1.5 font-mono"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error !== null && (
              <p role="alert" className="text-step-0 text-fail px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="border-border flex items-center justify-between border-t p-3">
          {view === 'phases' ? (
            <button
              type="button"
              onClick={() => {
                setView('commands')
                setQuery('')
              }}
              className="text-step-0 text-text-3 hover:text-text-2 font-mono"
            >
              &lsaquo; commands
            </button>
          ) : (
            <span />
          )}
          <span data-testid="palette-last" className="text-step-0 text-text-3 font-mono">
            esc to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
