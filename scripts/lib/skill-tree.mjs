/*
 * Parses the curriculum documents into graph data.
 *
 * The documents are the source of truth, not a copy of it. Every seeder and the
 * acyclicity test read through this module, so there is exactly one definition
 * of what a tree line means — a second parser that drifted from this one would
 * let the seed and the test agree with each other while both disagreed with the
 * curriculum.
 *
 * Two tree dialects exist and both are handled here:
 *   LEARNING_ENGINE.md §2  — brace lists may WRAP across lines (postgres,
 *                            interview), so lines accumulate until a closing
 *                            brace arrives.
 *   DATA_ML_TRACK.md §9.1  — single-line by construction, stated in the
 *                            document so the parser cannot mis-read a wrap.
 */

/** Strips the box-drawing characters; they carry no information. */
const clean = (raw) => raw.replace(/[├└│─]/g, ' ').trim()

/**
 * The fenced block at `block` (0-based) after the `section` heading.
 *
 * Indexed rather than "the first one" because LEARNING_ENGINE.md §2 carries two
 * trees after the Data & ML amendment: the engineering graph and this track's.
 */
export function codeBlock(markdown, section, block = 0) {
  const after = markdown.split(section)[1]
  if (after === undefined) throw new Error(`section not found: ${section}`)

  const fences = after.split('```')
  // Odd indices are block bodies: [before, body, between, body, ...].
  const body = fences[block * 2 + 1]
  if (body === undefined) {
    throw new Error(`code block ${block} not found after ${section}`)
  }
  return body
}

/**
 * Parses a category tree into `{ id, parentId, category, topic, name }`.
 *
 * A topic is its own id; a leaf is `topic/leaf`. That convention is what lets
 * the node set be derived from an edge list elsewhere.
 */
export function parseTree(markdown, section, block = 0) {
  const nodes = []
  let category = null
  let pending = ''

  for (const raw of codeBlock(markdown, section, block).split('\n')) {
    const line = clean(raw)
    if (line === '') continue

    if (/^[A-Z_]+$/.test(line)) {
      category = line
      pending = ''
      continue
    }
    if (category === null) continue

    pending = pending === '' ? line : `${pending} ${line}`
    // A topic's brace list may wrap across several lines.
    if (!pending.includes('}')) continue

    const match = pending.match(/^([a-z0-9-]+)\s*\{([^}]*)\}/)
    pending = ''
    if (!match) continue

    const [, topic, children] = match
    nodes.push({ id: topic, parentId: null, category, topic, name: titleCase(topic) })

    for (const child of children
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)) {
      nodes.push({
        id: `${topic}/${child}`,
        parentId: topic,
        category,
        topic,
        name: titleCase(child),
      })
    }
  }

  return nodes
}

/**
 * Parses a `skill → requires` list into `[skillId, requiresId]` pairs.
 *
 * The ◆ marker on cross-track edges is presentation and is dropped. A line that
 * does not contain exactly one arrow is a malformed edge, not something to skip
 * quietly — a silently dropped prerequisite is invisible until the scheduler
 * offers something the user cannot do yet.
 */
export function parseEdges(markdown, section, block = 0) {
  const edges = []

  for (const raw of codeBlock(markdown, section, block).split('\n')) {
    const line = raw.replace(/◆/g, '').trim()
    if (line === '') continue

    const parts = line.split('→').map((s) => s.trim())
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
      throw new Error(`malformed prerequisite line: ${JSON.stringify(line)}`)
    }
    edges.push([parts[0], parts[1]])
  }

  return edges
}

/**
 * Parses the §9.2 phase tables into `topic -> phase`.
 *
 * Both tables are read — engineering topics carry phases too, so the scheduler
 * stops offering advanced material on day one. Parentheticals are stripped
 * BEFORE the comma split: "nlp (plus the existing AI_ENGINEERING topics,
 * cross-listed)" contains a comma inside the note, and splitting first invents
 * a topic called "cross-listed)".
 */
export function parsePhases(markdown, section, until) {
  const after = markdown.split(section)[1]
  if (after === undefined) throw new Error(`section not found: ${section}`)

  // Bounded, or the scan runs to the end of the document and picks up any
  // later table whose first column happens to look like a phase id.
  const region = until === undefined ? after : after.split(until)[0]
  const phases = new Map()
  const rows = region.matchAll(/^\|\s*([ED]\d+)\s*\|\s*([^|]+?)\s*\|/gm)

  for (const [, phase, list] of rows) {
    for (const entry of list.replace(/\([^)]*\)/g, '').split(',')) {
      const topic = entry.trim()
      if (topic === '') continue
      const existing = phases.get(topic)
      if (existing !== undefined && existing !== phase) {
        throw new Error(`${topic} is assigned to both ${existing} and ${phase}`)
      }
      phases.set(topic, phase)
    }
  }

  return phases
}

export function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
