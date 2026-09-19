import { passkeyClient } from '@better-auth/passkey/client'
import { magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/*
 * Browser half of the auth gateway. Same rule as the server half: components
 * import this, never better-auth directly.
 *
 * No baseURL: the client talks to the same origin it was served from, so a
 * preview deployment does not need to be told its own address.
 */
export const authClient = createAuthClient({
  plugins: [passkeyClient(), magicLinkClient()],
})
