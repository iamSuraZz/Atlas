import { countUsers } from '@/infra/db/users'
import { SignInForm } from './sign-in-form'

/*
 * Reads the database, so it must not be prerendered: `next build` would evaluate
 * it without DATABASE_URL and fail. Marking it dynamic keeps the build
 * environment-free, which is what lets CI build without a database.
 */
export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  /*
   * Whether registration is open is a fact about the database, not a sentence
   * someone remembered to update. null means the question could not be answered
   * — the page says so rather than guessing.
   */
  let registrationOpen: boolean | null

  try {
    registrationOpen = (await countUsers()) === 0
  } catch {
    registrationOpen = null
  }

  return <SignInForm registrationOpen={registrationOpen} />
}
