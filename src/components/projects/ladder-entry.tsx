'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { markProjectComplete, markProjectIncomplete } from '@/app/(app)/projects/actions'

/*
 * The completion control for one ladder rung.
 *
 * The URL field is not optional and there is no "mark done" that skips it —
 * §6 makes the artifact the definition of completion, not a nice-to-have
 * attached to it.
 */
export function LadderEntry({
  projectId,
  artifactUrl,
}: {
  projectId: string
  artifactUrl: string | null
}) {
  const [url, setUrl] = useState(artifactUrl ?? '')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (artifactUrl !== null && !open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={artifactUrl}
          target="_blank"
          rel="noreferrer"
          className="text-step-0 text-accent font-mono underline underline-offset-2"
        >
          {artifactUrl}
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-step-0 text-text-3 hover:text-text-2 font-mono"
        >
          change
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markProjectIncomplete(projectId)
            })
          }
          className="text-step-0 text-text-3 hover:text-text-2 font-mono"
        >
          reopen
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/… or the public notebook"
          aria-label="Public artifact URL"
          inputMode="url"
          className="min-w-64 flex-1"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One line, optional"
          aria-label="Note, optional"
          className="min-w-48 flex-1"
        />
        <Button
          variant="primary"
          disabled={pending || url.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await markProjectComplete(projectId, url, note)
              if (!result.ok) setError(result.message)
              else setOpen(false)
            })
          }
        >
          {pending ? 'Saving…' : 'Mark complete'}
        </Button>
      </div>

      <p className="text-step-0 text-text-3">
        A project with no public artifact does not count — §6.
      </p>

      {error !== null && (
        <p role="alert" className="text-step-0 text-fail">
          {error}
        </p>
      )}
    </div>
  )
}
