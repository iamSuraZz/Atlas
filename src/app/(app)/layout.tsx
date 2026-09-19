import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AccountMenu } from '@/components/shell/account-menu'
import { CommandPalette } from '@/components/shell/command-palette'
import { Nav } from '@/components/shell/nav'
import { getAuth } from '@/infra/auth/server'

/*
 * Reads the session, so it cannot be prerendered — see the same note in
 * (auth)/sign-in/page.tsx. Keeps `next build` working without a database.
 */
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  /*
   * The gate is here rather than in middleware: this is the only place every
   * shell route passes through, and a server check cannot be skipped by a
   * client that chooses not to run it.
   */
  const session = await getAuth().api.getSession({ headers: await headers() })

  if (!session) redirect('/sign-in')

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <span className="text-step-1 font-medium">Atlas</span>
          <div className="flex items-center gap-3">
            <CommandPalette />
            <AccountMenu />
          </div>
        </div>
      </header>

      <Nav />

      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
