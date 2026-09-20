import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MissionRunner, type RunnerMission } from '@/components/runner/mission-runner'
import { getAuth } from '@/infra/auth/server'
import { getMissionForUser } from '@/infra/db/plans'

export const dynamic = 'force-dynamic'

/*
 * M2 ships EXPLAIN, REVIEW and QUERY. The others are not stubbed: a runner
 * that pretends to run a BUILD mission is worse than one that says it cannot,
 * and the scheduler does not select them yet anyway.
 */
const RUNNABLE = new Set(['EXPLAIN', 'REVIEW', 'QUERY'])

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  const mission = await getMissionForUser(session.user.id, (await params).id)
  if (!mission) notFound()

  if (!RUNNABLE.has(mission.format)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 px-6">
        <h1 className="text-step-2 font-medium">{mission.title}</h1>
        <p className="text-step-1 text-text-2">
          {mission.format} missions have no runner yet. M2 ships EXPLAIN, REVIEW and
          QUERY; the rest arrive when the scheduler selects them.
        </p>
        <Link
          href="/today"
          className="text-step-0 text-text-3 hover:text-text-2 font-mono"
        >
          &lsaquo; Today
        </Link>
      </main>
    )
  }

  return <MissionRunner mission={mission as RunnerMission} />
}
