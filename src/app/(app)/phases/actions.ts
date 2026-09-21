'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getAuth } from '@/infra/auth/server'
import { listActivePhases, setActivePhases } from '@/infra/db/track'

/*
 * Active phases, from the command palette. M-DS task d.
 *
 * Changing these changes what THEME and DATA_ML may offer tomorrow — it is the
 * single most consequential setting in the app, and it deliberately has no
 * settings screen. One ⌘K command, one list, no confirmation dialogue: the
 * cost of opening a phase early is that the scheduler offers you something you
 * are not ready for, which you notice immediately and undo in two keystrokes.
 */

export type PhasesResult =
  | { readonly ok: true; readonly active: readonly string[] }
  | { readonly ok: false; readonly message: string }

export async function readActivePhases(): Promise<PhasesResult> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  return { ok: true, active: await listActivePhases(session.user.id) }
}

/** Adds or removes one phase and returns the new set. */
export async function toggleActivePhase(phase: string): Promise<PhasesResult> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  const current = await listActivePhases(session.user.id)
  const next = current.includes(phase)
    ? current.filter((p) => p !== phase)
    : [...current, phase]

  try {
    await setActivePhases(session.user.id, next)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not change phases.',
    }
  }

  /*
   * Both screens read the active set: SKILLS scopes its list to it, TODAY's
   * next plan is built from it. Neither is revalidated by the other.
   */
  revalidatePath('/skills')
  revalidatePath('/today')

  return { ok: true, active: next.sort() }
}
