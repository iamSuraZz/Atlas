import { asc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import { resource, resourceSkill, skill } from './schema'

/*
 * The §8 resource library, as the runner needs it.
 *
 * WATCH shows a resource and then hides it behind the recall step, so this is
 * read once when the mission page renders and never again — the hiding is the
 * whole point of the format (§4.2 rule 4), and a second fetch from the client
 * would hand the video back at exactly the moment it is supposed to be gone.
 */

export type LearnResource = {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly url: string | null
  /** Null where §8 states nothing either way. */
  readonly free: boolean | null
  readonly note: string | null
}

/**
 * Resources for a skill, found through the topic it belongs to.
 *
 * `resource_skill` links topics rather than leaves, because §8 tags resources
 * with phases and phases are assigned per topic. So a leaf like
 * `python-data/pandas-core` has to resolve to `python-data` first — done in a
 * subquery rather than a second round trip.
 */
export async function resourcesForSkill(skillId: string): Promise<LearnResource[]> {
  return (
    getDb()
      .select({
        id: resource.id,
        kind: resource.kind,
        title: resource.title,
        url: resource.url,
        free: resource.free,
        note: resource.note,
      })
      .from(resource)
      .innerJoin(resourceSkill, eq(resourceSkill.resourceId, resource.id))
      .where(
        eq(
          resourceSkill.skillId,
          sql`(SELECT COALESCE(${skill.parentId}, ${skill.id}) FROM ${skill} WHERE ${skill.id} = ${skillId})`,
        ),
      )
      // WATCH first: §8's "visual first, always" is an ordering instruction.
      .orderBy(asc(resource.kind), asc(resource.title))
  )
}
