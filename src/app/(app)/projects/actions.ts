'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getAuth } from '@/infra/auth/server'
import { completeProject, reopenProject } from '@/infra/db/track'

/*
 * PROJECTS actions. M-DS task d.
 *
 * §6: "A project with no public artifact does not count." That is checked
 * here, again in the repository, and once more by a CHECK on the table. Three
 * times because it is the rule the whole ladder rests on — a project you
 * claim but cannot show is the thing this app exists to prevent.
 */

export type ProjectResult = { ok: true } | { ok: false; message: string }

export async function markProjectComplete(
  projectId: string,
  artifactUrl: string,
  note: string,
): Promise<ProjectResult> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  const url = artifactUrl.trim()
  if (url === '') {
    return {
      ok: false,
      message:
        'A public artifact URL is required. A project with no artifact does not count.',
    }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      ok: false,
      message: 'That is not a URL. Paste the repository or notebook link.',
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'The artifact must be reachable over http or https.' }
  }

  await completeProject(
    session.user.id,
    projectId,
    url,
    note.trim() === '' ? null : note.trim(),
  )
  revalidatePath('/projects')
  return { ok: true }
}

export async function markProjectIncomplete(projectId: string): Promise<ProjectResult> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) return { ok: false, message: 'Not signed in.' }

  await reopenProject(session.user.id, projectId)
  revalidatePath('/projects')
  return { ok: true }
}
