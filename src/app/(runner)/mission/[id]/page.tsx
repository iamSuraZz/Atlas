import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MissionRunner, type RunnerMission } from '@/components/runner/mission-runner'
import { getAuth } from '@/infra/auth/server'
import { getMissionForUser } from '@/infra/db/plans'
import { resourcesForSkill, type LearnResource } from '@/infra/db/resources'

export const dynamic = 'force-dynamic'

/*
 * Seven formats run. DEBUG, BUILD, DESIGN, DEFEND, TEACH, INTERVIEW and
 * APPLY_TO_PROJECT are not stubbed: a runner that pretends to run a BUILD
 * mission is worse than one that says it cannot, and the scheduler does not
 * select them yet anyway.
 */
const RUNNABLE = new Set([
  'EXPLAIN',
  'REVIEW',
  'QUERY',
  'WATCH',
  'NOTEBOOK',
  'MATH_BY_HAND',
  'VISUALIZE',
])

/**
 * The unit of the expected answer, and nothing else from the check spec.
 *
 * This is a server component: everything it returns is serialised into the
 * page the browser receives. Sending `expected` here — even to hide it in the
 * markup — would put the answer one devtools panel away from the person being
 * asked for it. The worked answer arrives from `revealWorkedAnswer` after the
 * attempt is recorded.
 */
function answerUnitOf(checkSpec: unknown): string | null {
  if (typeof checkSpec !== 'object' || checkSpec === null) return null
  const unit = (checkSpec as Record<string, unknown>)['unit']
  return typeof unit === 'string' && unit !== '' ? unit : null
}

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
          {mission.format} missions have no runner yet. They arrive when the scheduler
          selects them.
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

  /*
   * Fetched only for WATCH, and only here. The whole format turns on the
   * resource being gone once you start answering (§4.2 rule 4), so the client
   * never gets a way to ask for it again.
   */
  const resources: LearnResource[] =
    mission.format === 'WATCH' ? await resourcesForSkill(mission.skillId) : []

  const runnerMission: RunnerMission = {
    id: mission.id,
    skillId: mission.skillId,
    format: mission.format as RunnerMission['format'],
    title: mission.title,
    brief: mission.brief,
    why: mission.why,
    estMinutes: mission.estMinutes,
    answerUnit: answerUnitOf(mission.checkSpec),
  }

  return <MissionRunner mission={runnerMission} resources={resources} />
}
