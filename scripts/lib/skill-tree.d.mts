/*
 * Types for skill-tree.mjs — see branch-guard.d.mts for why these are
 * hand-written rather than inferred.
 */

/** A node in the curriculum tree. A topic has `parentId === null`. */
export type TreeNode = {
  readonly id: string
  readonly parentId: string | null
  readonly category: string
  readonly topic: string
  readonly name: string
}

/** `[skillId, requiresId]` — the skill needs the requirement first. */
export type Edge = readonly [string, string]

export declare function codeBlock(
  markdown: string,
  section: string,
  block?: number,
): string

export declare function parseTree(
  markdown: string,
  section: string,
  block?: number,
): TreeNode[]

export declare function parseEdges(
  markdown: string,
  section: string,
  block?: number,
): Edge[]

/** `topic -> phase`, e.g. `'python-data' -> 'D0'`. */
export declare function parsePhases(
  markdown: string,
  section: string,
  until?: string,
): Map<string, string>

export declare function titleCase(slug: string): string
