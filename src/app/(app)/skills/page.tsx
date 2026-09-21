import Link from 'next/link'
import { headers } from 'next/headers'
import { getAuth } from '@/infra/auth/server'
import { listSkillRows, type MasteryStateName, type SkillRow } from '@/infra/db/skills'
import { formatActivePhases } from '@/lib/phases'
import { listActivePhases } from '@/infra/db/track'

export const dynamic = 'force-dynamic'

/*
 * UX_PLAN §3.3: the weak list, not the graph. A force-directed diagram of 358
 * nodes is beautiful and useless for deciding what to do this evening, so the
 * default view sorts by what needs attention and nothing else.
 *
 * M-DS task d adds two filters, both in the URL rather than in client state —
 * this is a server component, the filtering is a database concern, and a
 * shareable link to "the weak Data & ML nodes I am working on" costs nothing.
 *
 * The default is narrow on purpose: 358 nodes is not a list, it is a wall. The
 * active phases are the ~107 you are actually working through, and everything
 * else is one click away rather than hidden.
 *
 * Read-only. No editing, no assessment — a state moves only through the
 * mastery gate, which is not reachable from this screen.
 */

const GROUPS = [
  {
    heading: 'NEEDS WORK',
    note: 'Below PRACTICAL — cannot yet be used unaided.',
    states: ['UNASSESSED', 'INTRODUCED', 'DEVELOPING', null],
  },
  {
    heading: 'MOVING',
    note: 'Usable unaided. Next step is explaining it under pressure.',
    states: ['PRACTICAL'],
  },
  {
    heading: 'SOLID',
    note: 'Defensible in an interview.',
    states: ['INTERVIEW_READY', 'MASTERED'],
  },
] as const

const TRACKS = [
  { key: 'all', label: 'Both tracks' },
  { key: 'ENGINEERING', label: 'Engineering' },
  { key: 'DATA_ML', label: 'Data & ML' },
] as const

function daysAgo(date: Date | null): string {
  if (date === null) return '—'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  return days === 0 ? 'today' : `${days}d`
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-ctl border-accent bg-accent text-accent-fg text-step-0 border px-3 py-1.5 font-mono'
          : 'rounded-ctl border-border-control text-text-2 hover:text-text text-step-0 border px-3 py-1.5 font-mono transition-colors duration-150 ease-out'
      }
    >
      {children}
    </Link>
  )
}

function SkillLine({ row }: { row: SkillRow }) {
  return (
    <li>
      <Link
        href={`/skills/${row.id}`}
        className="group rounded-ctl hover:bg-raised flex items-baseline gap-3 px-2 py-2 transition-colors duration-150 ease-out"
      >
        <span className="text-step-1 min-w-0 flex-1 truncate font-mono">{row.id}</span>
        <span className="text-step-0 text-text-3 w-10 text-right font-mono">
          {row.phase ?? '—'}
        </span>
        <span className="text-step-0 text-text-2 font-mono">
          {row.state ?? 'UNASSESSED'}
        </span>
        <span className="text-step-0 text-text-3 w-24 text-right font-mono">
          {row.objectiveEvidenceCount > 0
            ? `${row.objectiveEvidenceCount} evidence`
            : `last: ${daysAgo(row.lastPractised)}`}
        </span>
        <span aria-hidden="true" className="text-text-3 group-hover:text-text-2">
          &rsaquo;
        </span>
      </Link>
    </li>
  )
}

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; scope?: string }>
}) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  const params = await searchParams
  const track = TRACKS.some((t) => t.key === params.track) ? params.track! : 'all'
  const showAll = params.scope === 'all'

  const [rows, activePhases] = await Promise.all([
    listSkillRows(session.user.id),
    listActivePhases(session.user.id),
  ])

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-step-3 font-medium">Skills</h1>
        <p className="text-step-1 text-text-2 max-w-prose">
          The skill graph has no nodes yet. The tables exist, but nothing has been seeded
          — run <span className="font-mono">npm run db:seed</span>.
        </p>
      </section>
    )
  }

  const active = new Set(activePhases)
  const visible = rows.filter((row) => {
    if (track !== 'all' && row.track !== track) return false
    if (showAll) return true
    return row.phase !== null && active.has(row.phase)
  })

  const link = (next: { track?: string; scope?: string }) => {
    const query = new URLSearchParams()
    const t = next.track ?? track
    const s = next.scope ?? (showAll ? 'all' : 'active')
    if (t !== 'all') query.set('track', t)
    if (s === 'all') query.set('scope', 'all')
    const suffix = query.toString()
    return suffix === '' ? '/skills' : `/skills?${suffix}`
  }

  const byGroup = GROUPS.map((group) => ({
    ...group,
    rows: visible.filter((row) =>
      (group.states as readonly (MasteryStateName | null)[]).includes(row.state),
    ),
  }))

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-step-3 font-medium">Skills</h1>
        <p className="text-step-1 text-text-2 max-w-prose">
          {visible.length} of {rows.length} nodes, weakest first.{' '}
          {showAll
            ? 'Showing the whole graph, including phases you have not opened yet.'
            : activePhases.length === 0
              ? 'No phase is active, so nothing is in scope. Open one with ⌘K.'
              : `Scoped to your active phases: ${formatActivePhases(activePhases)}.`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {TRACKS.map((t) => (
            <Chip key={t.key} href={link({ track: t.key })} active={track === t.key}>
              {t.label}
            </Chip>
          ))}
          <span aria-hidden="true" className="text-text-3 px-1">
            ·
          </span>
          {/*
           * The one toggle. §3.3 keeps the default narrow, but a curriculum you
           * cannot see the shape of is one you cannot plan against.
           */}
          <Chip href={link({ scope: showAll ? 'active' : 'all' })} active={showAll}>
            {showAll ? 'Active phases only' : 'Show full graph'}
          </Chip>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-step-1 text-text-2">
          Nothing matches. Try the full graph, or open a phase with ⌘K.
        </p>
      ) : (
        byGroup.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <h2 className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
              {group.heading}
              <span className="ml-2 normal-case">({group.rows.length})</span>
            </h2>
            <p className="text-step-0 text-text-3">{group.note}</p>

            {group.rows.length === 0 ? (
              <p className="text-step-0 text-text-3 px-2 py-2">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-col">
                {group.rows.map((row) => (
                  <SkillLine key={row.id} row={row} />
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  )
}
