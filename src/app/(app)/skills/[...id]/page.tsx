import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  evaluateMastery,
  type ArtifactKind,
  type MasteryState,
  type Requirement,
} from '@/domain/skills/mastery'
import { getAuth } from '@/infra/auth/server'
import { listEvidenceForSkill } from '@/infra/db/evidence'
import { resourcesForSkill, type LearnResource } from '@/infra/db/resources'
import { getSkillDetail } from '@/infra/db/skills'

export const dynamic = 'force-dynamic'

/*
 * UX_PLAN §3.3 skill detail: state, the evidence chain that justified it, the
 * audit history, the next review date, and — the part that makes the screen
 * worth opening — exactly what would raise it.
 *
 * That last section is not written here. It comes from the mastery gate in
 * src/domain/skills/mastery.ts, so the screen and the promotion logic cannot
 * drift apart: if the gate would not promote, the screen says why in the gate's
 * own words.
 *
 * Read-only throughout. Nothing on this page writes.
 */

/*
 * §3.1's artifact taxonomy is finer-grained than the evidence_kind enum. The
 * gate consumes only the count, so this mapping exists to satisfy the type
 * while keeping evidence_skill.objective as the authoritative signal.
 */
const ARTIFACT_KIND: Partial<Record<string, ArtifactKind>> = {
  CODE_ARTIFACT: 'TESTS_PASS',
  QUERY_OPTIMISATION: 'MEASURED_IMPROVEMENT',
  DESIGN_DOC: 'DESIGN_CHECKLIST',
  ASSESSMENT: 'EVAL_HARNESS',
  PUBLISHED_WRITING: 'DESIGN_CHECKLIST',
  INCIDENT: 'MEASURED_IMPROVEMENT',
}

/*
 * Requirements Atlas can currently observe. Everything else in §3.1 is derived
 * from attempts, explain-aloud evaluations and teach-backs, none of which have
 * a table yet — so the screen reports them as untracked rather than as failures
 * you could fix today.
 */
const OBSERVABLE: ReadonlySet<Requirement> = new Set<Requirement>([
  'OBJECTIVE_ARTIFACT',
  'PREREQUISITES_PRACTICAL',
])

const formatDate = (date: Date | null) =>
  date === null ? '—' : date.toISOString().slice(0, 10)

/*
 * §8's resource library, grouped as M-DS task d asks: Watch, Play, Course,
 * Read. Free first inside each group.
 *
 * Only four of the seven `resource_kind` values can actually reach this screen
 * today — the Books, Practise and Tools sections of §8 carry no phase tag, so
 * the seeder derives no skill links for them. The other three are mapped
 * anyway rather than dropped, so adding a phase to one of those sections later
 * changes the seed and not this file.
 */
const LEARN_GROUPS = [
  { heading: 'Watch', kinds: ['WATCH'] },
  { heading: 'Play', kinds: ['PLAY', 'PRACTISE'] },
  { heading: 'Course', kinds: ['COURSE'] },
  { heading: 'Read', kinds: ['READ_FREE', 'READ_BOOK'] },
  { heading: 'Tools', kinds: ['TOOL'] },
] as const

/** Free first, then unstated, then paid. `free` is nullable where §8 is silent. */
const freeRank = (free: boolean | null): number =>
  free === true ? 0 : free === null ? 1 : 2

function LearnIt({ resources }: { resources: readonly LearnResource[] }) {
  if (resources.length === 0) return null

  const groups = LEARN_GROUPS.map((group) => ({
    heading: group.heading,
    items: resources
      .filter((r) => (group.kinds as readonly string[]).includes(r.kind))
      .sort(
        (a, b) => freeRank(a.free) - freeRank(b.free) || a.title.localeCompare(b.title),
      ),
  })).filter((group) => group.items.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Learn it</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-0">
        <p className="text-step-0 text-text-3">
          From DATA_ML_TRACK.md §8. Visual first, always — that is the ordering, not a
          preference.
        </p>
        {groups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <h3 className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
              {group.heading}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                  {r.url === null ? (
                    <span className="text-step-1">{r.title}</span>
                  ) : (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-step-1 text-accent underline underline-offset-2"
                    >
                      {r.title}
                    </a>
                  )}
                  {r.free === true && (
                    <span className="text-step-0 text-ok font-mono">free</span>
                  )}
                  {r.free === false && (
                    <span className="text-step-0 text-text-3 font-mono">paid</span>
                  )}
                  {r.note !== null && (
                    <span className="text-step-0 text-text-3">{r.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string[] }>
}) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  // Skill ids carry a slash ('postgres/indexing'), so the route is a catch-all
  // and the segments are rejoined here.
  const skillId = (await params).id.join('/')
  const detail = await getSkillDetail(session.user.id, skillId)
  if (detail === null) notFound()

  const chain = await listEvidenceForSkill(session.user.id, skillId)
  const objectiveChain = chain.filter((item) => item.objective)

  const verdict = evaluateMastery({
    now: new Date(),
    current: (detail.state ?? 'UNASSESSED') as MasteryState,
    // No column records whether a skill admits an objective artifact; see the
    // note rendered below. Defaulting to "available" is the stricter choice.
    artifactPolicy: 'OBJECTIVE_ARTIFACT_AVAILABLE',
    prerequisiteStates: detail.prerequisites.map(
      (p) => (p.state ?? 'UNASSESSED') as MasteryState,
    ),
    evidence: {
      artifacts: objectiveChain.flatMap((item) => {
        const kind = ARTIFACT_KIND[item.kind]
        return kind ? [{ kind, at: item.createdAt }] : []
      }),
      attempts: [],
      explainAloud: [],
      realInterviewResults: [],
      projectApplications: 0,
      interviewQuestionsAnsweredWell: 0,
      teachBacks: 0,
    },
  })

  const learn = await resourcesForSkill(detail.skill.id)

  const actionable = verdict.blockedBy.filter((b) => OBSERVABLE.has(b.requirement))
  const untracked = verdict.blockedBy.filter((b) => !OBSERVABLE.has(b.requirement))

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/skills"
          className="text-step-0 text-text-3 hover:text-text-2 font-mono"
        >
          &lsaquo; Skills
        </Link>
        <h1 className="text-step-3 font-mono font-medium">{detail.skill.id}</h1>
        <p className="text-step-1 text-text-2 max-w-prose">{detail.skill.description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['State', detail.state ?? 'UNASSESSED'],
          ['Last practised', formatDate(detail.lastPractised)],
          ['Next review', formatDate(detail.nextReview)],
          ['Decay class', detail.skill.decay],
          ['Track', detail.skill.track === 'DATA_ML' ? 'Data & ML' : 'Engineering'],
          ['Phase', detail.skill.phase ?? '—'],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
                {label}
              </p>
              <p className="text-step-1 mt-1 font-mono">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <LearnIt resources={learn} />

      <Card>
        <CardHeader>
          <CardTitle>What would raise it</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {verdict.blockedBy.length === 0 ? (
            <p className="text-step-1 text-ok">
              Every requirement for the next level is met.
            </p>
          ) : (
            <>
              {actionable.length > 0 && (
                <ul className="text-step-1 flex list-disc flex-col gap-1 pl-5">
                  {actionable.map((b) => (
                    <li key={b.requirement}>{b.explanation}</li>
                  ))}
                </ul>
              )}

              {untracked.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
                    Not tracked yet
                  </p>
                  <ul className="text-step-0 text-text-3 flex list-disc flex-col gap-1 pl-5">
                    {untracked.map((b) => (
                      <li key={b.requirement}>{b.explanation}</li>
                    ))}
                  </ul>
                  <p className="text-step-0 text-text-3 mt-1 max-w-prose">
                    Atlas records objective artifacts and prerequisite states. Attempts,
                    explain-aloud evaluations and teach-backs have no table yet, so these
                    cannot be satisfied from inside the app.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence chain</CardTitle>
        </CardHeader>
        <CardContent>
          {chain.length === 0 ? (
            <p className="text-step-1 text-text-3">
              No evidence linked to this skill. Nothing has justified its level.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {chain.map((item) => (
                <li key={item.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-step-1">{item.title}</span>
                    {item.objective && (
                      <span className="text-step-0 text-ok font-mono">objective</span>
                    )}
                  </div>
                  <p className="text-step-0 text-text-3 font-mono">
                    {item.kind} · {item.occurredOn}
                    {item.metricValue !== null &&
                      ` · ${item.metricValue}${item.metricUnit ?? ''} (${item.metricSource ?? 'no source'})`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transition history</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.transitions.length === 0 ? (
            <p className="text-step-1 text-text-3">
              No transitions recorded. This node has never changed level.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.transitions.map((t) => (
                <li
                  key={`${t.createdAt.toISOString()}-${t.toState}`}
                  className="text-step-0"
                >
                  <span className="text-text-2 font-mono">
                    {t.fromState} &rarr; {t.toState}
                  </span>
                  <span className="text-text-3 ml-2">
                    {formatDate(t.createdAt)} · {t.automatic ? 'automatic' : 'manual'}
                  </span>
                  <p className="text-text-3">{t.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {detail.prerequisites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Prerequisites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {detail.prerequisites.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/skills/${p.id}`}
                    className="text-step-1 font-mono hover:underline"
                  >
                    {p.id}
                  </Link>
                  <span className="text-step-0 text-text-2 font-mono">
                    {p.state ?? 'UNASSESSED'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
