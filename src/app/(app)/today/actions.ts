'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getAuth } from '@/infra/auth/server'
import { startMission as markStarted } from '@/infra/db/plans'
import { regenerateTodayPlan } from '@/infra/plan/regenerate'
import type { Intensity } from '@/infra/db/plans'

export type ActionResult = { ok: true } | { ok: false; message: string }

async function requireUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  return session?.user.id ?? null
}

/**
 * §3.1: "Changing it regenerates instantly." The switcher calls this and
 * nothing else — the screen does not know how a plan is built.
 */
export async function setIntensity(intensity: Intensity): Promise<ActionResult> {
  const userId = await requireUserId()
  if (userId === null) return { ok: false, message: 'Not signed in.' }

  await regenerateTodayPlan(userId, intensity, new Date())
  revalidatePath('/today')
  return { ok: true }
}

/**
 * "This screen only displays and starts." Starting marks the mission
 * IN_PROGRESS; running it is the mission runner, M2 task e.
 */
export async function startMission(missionId: string): Promise<ActionResult> {
  const userId = await requireUserId()
  if (userId === null) return { ok: false, message: 'Not signed in.' }

  await markStarted(userId, missionId)
  revalidatePath('/today')
  return { ok: true }
}
