'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startMission } from '@/app/(app)/today/actions'
import { Button } from '@/components/ui/button'

/*
 * "This screen only displays and starts." Starting marks the mission
 * IN_PROGRESS, then hands off to the runner. The status write happens before
 * navigation so a mission that was opened is recorded as started even if the
 * runner is abandoned.
 */
export function StartButton({
  missionId,
  started,
}: {
  missionId: string
  started: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (started) {
    return (
      <Button variant="primary" onClick={() => router.push(`/mission/${missionId}`)}>
        Resume →
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startMission(missionId)
            if (!result.ok) {
              setError(result.message)
              return
            }
            router.push(`/mission/${missionId}`)
          })
        }
      >
        {pending ? 'Starting…' : 'Start →'}
      </Button>
      {error !== null && (
        <p role="alert" className="text-step-0 text-fail">
          {error}
        </p>
      )}
    </div>
  )
}
