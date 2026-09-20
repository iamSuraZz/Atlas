'use client'

import { useState, useTransition } from 'react'
import { setIntensity } from '@/app/(app)/today/actions'
import { cn } from '@/lib/utils'
import type { Intensity } from '@/infra/db/plans'

const OPTIONS: readonly Intensity[] = ['LIGHT', 'NORMAL', 'DEEP']

/*
 * UX_PLAN §3.1: one control in the header, and changing it regenerates.
 *
 * A segmented control rather than a dropdown: three options, always visible,
 * one click to change. A <select> would hide the other two behind an
 * interaction for no gain.
 *
 * Deliberately no copy anywhere implying LIGHT is a lesser day (§4.3).
 */
export function IntensitySwitcher({ current }: { current: Intensity }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Optimistic, so the control responds on click rather than after a round trip.
  const [shown, setShown] = useState<Intensity>(current)

  function choose(next: Intensity) {
    if (next === shown || pending) return
    const previous = shown
    setShown(next)
    setError(null)

    startTransition(async () => {
      const result = await setIntensity(next)
      if (!result.ok) {
        setShown(previous)
        setError(result.message)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="radiogroup"
        aria-label="Session intensity"
        className="rounded-ctl border-border-control flex border"
      >
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={shown === option}
            disabled={pending}
            onClick={() => choose(option)}
            className={cn(
              'rounded-ctl text-step-0 px-3 py-1.5 font-mono transition-colors duration-150 ease-out',
              shown === option ? 'bg-raised text-text' : 'text-text-3 hover:text-text-2',
              pending && 'opacity-60',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="text-step-0 text-fail max-w-xs text-right">
          {error}
        </p>
      )}
    </div>
  )
}
