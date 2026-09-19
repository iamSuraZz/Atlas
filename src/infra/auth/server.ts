import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { getDb } from '../db/client'
import { countUsers } from '../db/users'
import * as schema from '../db/schema'

/*
 * Passkey is the primary credential; magic link exists so that losing the
 * device is not the end of the account. Both are configured here, and nothing
 * outside this file imports Better Auth — CLAUDE.md rule 5's shape, applied to
 * auth rather than to the model gateway.
 */

type Auth = ReturnType<typeof buildAuth>

let cached: Auth | undefined

/** WebAuthn binds a credential to an origin. Deriving both from BETTER_AUTH_URL
 *  means a deployment cannot silently keep trusting localhost. */
function relyingParty(baseUrl: string): { rpID: string; origin: string } {
  const url = new URL(baseUrl)
  // rpID is the bare hostname: no scheme, no port. The origin keeps both.
  return { rpID: url.hostname, origin: url.origin }
}

function buildAuth() {
  const baseURL = process.env.BETTER_AUTH_URL

  if (!baseURL) {
    throw new Error('BETTER_AUTH_URL is not set. Passkeys derive their origin from it.')
  }

  const db = getDb()
  const { rpID, origin } = relyingParty(baseURL)

  return betterAuth({
    baseURL,
    database: drizzleAdapter(db, {
      provider: 'pg',
      /*
       * `user` is mapped onto the existing app_user table. Without this line
       * Better Auth would look for a table called `user` and a second notion of
       * identity would exist alongside the real one.
       */
      schema: { ...schema, user: schema.appUser },
    }),
    advanced: {
      database: {
        /*
         * Postgres assigns every id via gen_random_uuid(). Better Auth omits the
         * column on insert and reads back what the database chose, so app_user.id
         * stays a real uuid instead of an application-generated string.
         */
        generateId: false,
      },
    },
    databaseHooks: {
      user: {
        create: {
          /*
           * The unique index app_user_singleton already makes a second row
           * impossible. This exists so the attempt fails as a sentence rather
           * than as a raw constraint violation.
           */
          before: async () => {
            if ((await countUsers()) > 0) {
              // APIError, not Error: a bare throw leaves the endpoint returning 500
              // with an empty body, which tells the person nothing.
              throw new APIError('FORBIDDEN', {
                message:
                  'Registration is closed. Atlas is a single-user system and that user already exists.',
              })
            }

            return undefined
          },
        },
      },
    },
    plugins: [
      passkey({ rpID, rpName: 'Atlas', origin }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          /*
           * There is no email provider in M0 and inventing one would be a lie.
           * The link goes to the server log instead: your terminal in dev, the
           * Vercel function logs in production. Single user, so the only person
           * who can read those logs is the only person who should.
           */
          console.warn(`[magic-link transport] sign-in link for ${email}: ${url}`)
        },
      }),
    ],
  })
}

/** Built on first use, not at import: see the same reasoning in db/client.ts. */
export function getAuth(): Auth {
  cached ??= buildAuth()
  return cached
}
