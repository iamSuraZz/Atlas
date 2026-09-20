/*
 * Prerequisite graph invariants.
 *
 * LEARNING_ENGINE.md §2 says the skill graph is a DAG. A cycle there is not a
 * cosmetic problem: the PRACTICAL gate requires every prerequisite to be
 * PRACTICAL first, so a cycle makes a set of skills permanently unreachable,
 * and it does so silently — nothing errors, the nodes simply never promote.
 *
 * Pure: takes edges, returns an answer. No database, no clock.
 */

/** `[skillId, requiresId]` — skillId depends on requiresId. */
export type PrerequisiteEdge = readonly [skillId: string, requiresId: string]

/**
 * Returns the first cycle found as the path that closes it, or null when the
 * graph is acyclic.
 *
 * Depth-first with three colours rather than a visited set: a node reachable by
 * two different paths is ordinary, while a node encountered again *within the
 * current path* is the cycle. A plain visited set cannot tell those apart.
 */
export function findCycle(edges: readonly PrerequisiteEdge[]): string[] | null {
  const dependsOn = new Map<string, string[]>()
  for (const [skillId, requiresId] of edges) {
    const list = dependsOn.get(skillId)
    if (list === undefined) dependsOn.set(skillId, [requiresId])
    else list.push(requiresId)
  }

  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map<string, number>()
  const path: string[] = []

  function visit(node: string): string[] | null {
    const seen = colour.get(node) ?? WHITE
    if (seen === BLACK) return null
    if (seen === GREY) {
      // Closing edge found: return the loop itself, not the walk that reached it.
      const from = path.indexOf(node)
      return [...path.slice(from), node]
    }

    colour.set(node, GREY)
    path.push(node)

    for (const next of dependsOn.get(node) ?? []) {
      const cycle = visit(next)
      if (cycle !== null) return cycle
    }

    path.pop()
    colour.set(node, BLACK)
    return null
  }

  for (const node of dependsOn.keys()) {
    const cycle = visit(node)
    if (cycle !== null) return cycle
  }

  return null
}

/** Edge endpoints that are not nodes in the graph. */
export function danglingEndpoints(
  edges: readonly PrerequisiteEdge[],
  nodeIds: Iterable<string>,
): string[] {
  const known = new Set(nodeIds)
  const missing = new Set<string>()

  for (const edge of edges) {
    for (const id of edge) if (!known.has(id)) missing.add(id)
  }

  return [...missing].sort()
}
