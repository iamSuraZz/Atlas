'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PasskeyRegistration } from '@/components/passkey-registration'
import { authClient } from '@/infra/auth/client'

/*
 * Account actions live in the header rather than a settings screen, which M0
 * does not have and does not need for two buttons.
 */
export function AccountMenu() {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    /*
     * This deletes the session row server-side, not just the cookie. Sessions
     * otherwise sit in the table until their 7-day expiry with no way to revoke
     * them, which is why task 6 adds this rather than leaving it to M1.
     */
    await authClient.signOut()
    window.location.href = '/sign-in'
  }

  return (
    <div className="flex items-center gap-2">
      <PasskeyRegistration />
      <Button
        variant="ghost"
        size="sm"
        data-testid="sign-out"
        onClick={signOut}
        disabled={signingOut}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}
