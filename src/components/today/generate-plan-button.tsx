'use client'

import { useState, useTransition } from 'react'
import { setIntensity } from '@/app/(app)/today/actions'
import { Button } from '@/components/ui/button'
import type { Intensity } from '@/infra/db/plans'

/*
 * Generating the first plan of a day is a separate act from changing intensity.
 *
 * Without this the empty state had no way out: the switcher renders NORMAL as
 * selected, and selecting the value already shown is a no-op by design — so
 * every path to a first plan was closed.
 */
export function GeneratePlanButton({ intensity = 'NORMAL' }: { intensity?: Intensity }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await setIntensity(intensity)
            if (!result.ok) setError(result.message)
          })
        }
      >
        {pending ? 'Planning…' : 'Plan today'}
      </Button>

      {error !== null && (
        <p role="alert" className="text-step-0 text-fail">
          {error}
        </p>
      )}
    </div>
  )
}
