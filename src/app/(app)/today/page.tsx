import { headers } from 'next/headers'
import { Card, CardContent } from '@/components/ui/card'
import { GeneratePlanButton } from '@/components/today/generate-plan-button'
import { IntensitySwitcher } from '@/components/today/intensity-switcher'
import { StartButton } from '@/components/today/start-button'
import { getAuth } from '@/infra/auth/server'
import { getPlanForDate, type StoredPlan } from '@/infra/db/plans'

export const dynamic = 'force-dynamic'

/*
 * TODAY. UX_PLAN.md §3.1 — the whole product in one screen.
 *
 * What is deliberately absent, and must stay absent (§3.1, principle P4):
 *   - no streak
 *   - no XP, points or badges
 *   - no backlog or missed-day counter — nothing grows while you are away
 *   - no progress bar for the day. A 4/5 bar at 11pm creates pressure to do a
 *     bad fifth mission, which is worse than stopping at four.
 *
 * These are not omissions to be filled in later. Adding any of them is a
 * product change, not a feature.
 */

const formatPlanDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

function PrimaryMission({ plan }: { plan: StoredPlan }) {
  const primary = plan.missions.find((m) => m.isPrimary)
  if (!primary) return null

  return (
    <Card className="bg-raised">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
            Primary
          </span>
          <span className="text-step-0 text-text-2 font-mono">
            {primary.estMinutes} min
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-step-2 font-medium">{primary.title}</h2>
          <p className="text-step-0 text-text-3 font-mono">
            {primary.skillId} · {primary.format}
          </p>
        </div>

        {primary.brief !== '' && (
          <p className="text-step-1 text-text-2 max-w-prose">{primary.brief}</p>
        )}

        {/*
         * §3.1: the "why" is always visible on the primary. Not a tooltip, not
         * an expander — it is the motivation mechanism and it is free. Each
         * clause was generated from the scheduler's own terms (§4.5).
         */}
        {primary.why.length > 0 && (
          <p className="text-step-1 text-text-2 max-w-prose">{primary.why.join(' · ')}</p>
        )}

        <div className="flex justify-end">
          <StartButton
            missionId={primary.id}
            started={primary.status === 'IN_PROGRESS'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ThenList({ plan }: { plan: StoredPlan }) {
  // One primary, the rest collapsed. Five equal cards produce a choice, and a
  // choice produces delay.
  const rest = plan.missions.filter((m) => !m.isPrimary)
  if (rest.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
        Then
      </h2>
      <ul className="flex flex-col">
        {rest.map((m) => (
          <li
            key={m.id}
            className="border-border flex items-baseline gap-3 border-b py-3 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className={m.status === 'DONE' ? 'text-ok' : 'text-text-3'}
            >
              {m.status === 'DONE' ? '●' : '○'}
            </span>
            <span className="text-step-1 min-w-0 flex-1 truncate">{m.title}</span>
            <span className="text-step-0 text-text-3 font-mono">{m.format}</span>
            <span className="text-step-0 text-text-3 w-16 text-right font-mono">
              {m.estMinutes} min
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function TodayPage() {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return null

  const today = new Date().toISOString().slice(0, 10)
  const plan = await getPlanForDate(session.user.id, today)

  if (plan === null) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="text-step-2 font-medium">{formatPlanDate(today)}</h1>
          <IntensitySwitcher current="NORMAL" />
        </header>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="text-step-1 text-text-2 max-w-prose">No plan for today yet.</p>
            <GeneratePlanButton />
          </CardContent>
        </Card>
      </section>
    )
  }

  const plannedMinutes = plan.missions.reduce((sum, m) => sum + m.estMinutes, 0)

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-step-2 font-medium">{formatPlanDate(plan.planDate)}</h1>
        <IntensitySwitcher current={plan.intensity} />
      </header>

      <PrimaryMission plan={plan} />
      <ThenList plan={plan} />

      {/*
       * Minutes planned, not minutes done. A total that counts up as you work
       * is a progress bar wearing different clothes.
       */}
      <footer className="border-border border-t pt-4">
        <p className="text-step-0 text-text-3 font-mono">{plannedMinutes} min planned</p>
      </footer>
    </section>
  )
}
