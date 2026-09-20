import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from '@/infra/auth/server'

export const dynamic = 'force-dynamic'

/*
 * UX_PLAN §3.2: full-screen, chrome removed. A separate route group rather
 * than hiding the shell with CSS — nav that is present but invisible is still
 * in the tab order.
 */
export default async function RunnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')

  return <div className="min-h-dvh">{children}</div>
}
