'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/infra/auth/client'

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'registered' }
  | { kind: 'error'; message: string }

/*
 * The minimum M0 task 4 needs: without a way to register a credential there is
 * nothing to sign in with, so the task's done-when cannot be demonstrated.
 * Deliberately not a settings screen — no list, no rename, no delete. Task 6
 * builds the shell and can move this into it.
 */
export function PasskeyRegistration() {
  const { data: session, isPending } = authClient.useSession()
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function register() {
    setState({ kind: 'working' })

    try {
      const result = await authClient.passkey.addPasskey()

      if (result?.error) {
        setState({
          kind: 'error',
          message: result.error.message ?? 'The server rejected the passkey.',
        })
        return
      }

      setState({ kind: 'registered' })
    } catch (error) {
      /*
       * The browser throws rather than returning an error when the WebAuthn
       * prompt is dismissed or the device has no authenticator, so the happy
       * path alone would leave the button stuck on"Working…".
       */
      setState({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'The passkey prompt was dismissed.',
      })
    }
  }

  // The session is unknown on first paint. Rendering the button and then pulling
  // it away would be worse than waiting a beat.
  if (isPending) {
    return <p className="text-text-3 text-sm">Checking session…</p>
  }

  if (!session) return null

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        className="self-start"
        onClick={register}
        disabled={state.kind === 'working'}
      >
        {state.kind === 'working' ? 'Waiting for your device…' : 'Register a passkey'}
      </Button>

      {state.kind === 'registered' && (
        <p className="text-ok text-sm">
          Passkey registered. Sign out and sign back in to verify it.
        </p>
      )}

      {state.kind === 'error' && (
        <p role="alert" className="text-fail text-sm">
          {state.message}
        </p>
      )}
    </div>
  )
}
