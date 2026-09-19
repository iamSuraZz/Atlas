'use client'

import { useState } from 'react'
import { authClient } from '@/infra/auth/client'

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

export function SignInForm({ registrationOpen }: { registrationOpen: boolean | null }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function signInWithPasskey() {
    setStatus({ kind: 'working' })
    const result = await authClient.signIn.passkey()

    if (result?.error) {
      setStatus({
        kind: 'error',
        message: result.error.message ?? 'Passkey sign-in failed.',
      })
      return
    }

    window.location.href = '/'
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault()
    setStatus({ kind: 'working' })
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: '/' })

    setStatus(
      error
        ? { kind: 'error', message: error.message ?? 'Could not send link.' }
        : { kind: 'sent' },
    )
  }

  const busy = status.kind === 'working'

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">Atlas</h1>
        <RegistrationNotice registrationOpen={registrationOpen} />
      </div>

      <button
        type="button"
        onClick={signInWithPasskey}
        disabled={busy}
        className="rounded-[var(--r-ctl)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
      >
        {busy ? 'Working…' : 'Sign in with a passkey'}
      </button>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
        <label htmlFor="email" className="text-xs text-[var(--text-3)]">
          Or send a sign-in link
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-[var(--r-ctl)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-[var(--r-ctl)] border border-[var(--border)] px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
        >
          Send link
        </button>
      </form>

      {/* Email delivery is not built. The link is written to the server log. */}
      {status.kind === 'sent' && (
        <p className="text-sm text-[var(--ok,#3FB950)]">
          Link sent. Email delivery is not built yet — the link is in the server log.
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-[var(--fail,#F85149)]">
          {status.message}
        </p>
      )}
    </main>
  )
}

function RegistrationNotice({ registrationOpen }: { registrationOpen: boolean | null }) {
  // null means the count could not be read. Claiming either state would be a guess.
  if (registrationOpen === null) {
    return (
      <p role="alert" className="text-sm text-[var(--fail,#F85149)]">
        Could not reach the database to check whether registration is open.
      </p>
    )
  }

  return (
    <p className="text-sm text-[var(--text-3)]">
      {registrationOpen
        ? 'No account exists yet. The first sign-in creates it.'
        : 'Single user. Registration is closed.'}
    </p>
  )
}
