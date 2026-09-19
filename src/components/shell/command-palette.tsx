'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/*
 * Skeleton only: it opens, it closes, it has no commands. M2 fills it.
 *
 * Deliberately not cmdk — a list-filtering library with nothing to filter is a
 * dependency bought on speculation. Radix Dialog already supplies the parts
 * that are hard to get right: focus trap, focus restoration, Escape, scroll
 * lock, aria-modal.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        aria-describedby="palette-empty"
        className="top-[20%] translate-y-0 p-0"
      >
        <div className="border-border border-b p-3">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <Input
            data-testid="palette-input"
            placeholder="Search commands…"
            aria-label="Search commands"
          />
        </div>
        <DialogDescription id="palette-empty" className="text-step-0 text-text-3 p-6">
          No commands yet. M2 adds them — run a mission, log evidence, jump to a skill.
        </DialogDescription>
        <div className="border-border border-t p-3">
          <button
            type="button"
            data-testid="palette-last"
            disabled
            className="text-step-0 text-text-3 font-mono"
          >
            esc to close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
