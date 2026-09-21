import Link from 'next/link'
import { headers } from 'next/headers'
import { Card, CardContent } from '@/components/ui/card'
import { LadderEntry } from '@/components/projects/ladder-entry'
import { Placeholder } from '@/components/shell/placeholder'
import { getAuth } from '@/infra/auth/server'
import { listLadder, skillsForProjects, type LadderProject } from '@/infra/db/track'

export const dynamic = 'force-dynamic'

/*
 * PROJECTS. Two tabs.
 *
 * "Systems" — the deep-dive interrogation record — is still M3 and still says
 * so. "Build ladder" is the §6 project ladder, and it ships now because the
 * Data & ML track is mostly projects: fifteen rungs from IPL analytics to a
 * predictive-maintenance platform.
 *
 * The ladder is ordered and the order matters. P9 feeds P13 feeds P15, so
 * "current" is the lowest unfinished rung rather than whichever one happens to
 * sit in an active phase.
 */

const TABS = [
  { key: 'ladder', label: 'Build ladder' },
  { key: 'systems', label: 'Systems' },
] as const

function Rung({
  project,
  skills,
}: {
  project: LadderProject
  skills: readonly string[]
}) {
  const done = project.completedAt !== null

  return (
    <Card className={project.current ? 'border-accent bg-raised' : undefined}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-step-0 text-text-3 font-mono">{project.id}</span>
            <h3 className="text-step-1 font-medium">{project.name}</h3>
            {project.current && (
              <span className="text-step-0 text-accent font-mono tracking-widest uppercase">
                Current
              </span>
            )}
            {done && (
              <span className="text-step-0 text-ok font-mono tracking-widest uppercase">
                Done
              </span>
            )}
          </div>
          <span className="text-step-0 text-text-3 font-mono">
            {project.phase} · {project.level} ·{' '}
            {project.estHoursMin === project.estHoursMax
              ? `${project.estHoursMin}h`
              : `${project.estHoursMin}–${project.estHoursMax}h`}
          </span>
        </div>

        <p className="text-step-1 text-text-2 max-w-prose">{project.brief}</p>

        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
              Data
            </dt>
            <dd className="text-step-0 text-text-2">{project.dataSource}</dd>
          </div>
          <div>
            <dt className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
              Proves
            </dt>
            <dd className="text-step-0 text-text-2">{project.proves}</dd>
          </div>
        </dl>

        {skills.length > 0 && (
          <p className="text-step-0 text-text-3 font-mono">
            {skills.slice(0, 6).join(' · ')}
            {skills.length > 6 && ` · +${skills.length - 6}`}
          </p>
        )}

        <LadderEntry projectId={project.id} artifactUrl={project.artifactUrl} />
      </CardContent>
    </Card>
  )
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  const tab = (await searchParams).tab === 'systems' ? 'systems' : 'ladder'

  const nav = (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === 'ladder' ? '/projects' : `/projects?tab=${t.key}`}
          aria-current={tab === t.key ? 'page' : undefined}
          className={
            tab === t.key
              ? 'rounded-ctl border-accent bg-accent text-accent-fg text-step-0 border px-3 py-1.5 font-mono'
              : 'rounded-ctl border-border-control text-text-2 hover:text-text text-step-0 border px-3 py-1.5 font-mono transition-colors duration-150 ease-out'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  )

  if (tab === 'systems') {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-step-3 font-medium">Projects</h1>
        {nav}
        <Placeholder
          title="Systems"
          milestone="M3"
          what="Your systems, their facts, and the deep-dive interrogation record."
        />
      </section>
    )
  }

  const ladder = await listLadder(session.user.id)
  const skills = await skillsForProjects(ladder.map((p) => p.id))
  const done = ladder.filter((p) => p.completedAt !== null).length

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-step-3 font-medium">Projects</h1>
        <p className="text-step-1 text-text-2 max-w-prose">
          The §6 ladder: {ladder.length} projects, small to big. {done} finished. Every
          rung needs a public artifact — a repository or a public notebook — before it
          counts.
        </p>
      </div>

      {nav}

      {ladder.length === 0 ? (
        <p className="text-step-1 text-text-2">
          The ladder has not been seeded. Run{' '}
          <span className="font-mono">npm run db:seed:track</span>.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {ladder.map((project) => (
            <li key={project.id}>
              <Rung project={project} skills={skills.get(project.id) ?? []} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
