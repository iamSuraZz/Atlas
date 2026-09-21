import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  danglingEndpoints,
  findCycle,
  type PrerequisiteEdge,
} from '@/domain/skills/graph'
import { parseEdges, parsePhases, parseTree } from '../../scripts/lib/skill-tree.mjs'

/*
 * Two jobs. The first half tests the cycle detector against fixtures, because a
 * detector that has only ever seen acyclic input is a detector nobody has
 * tested. The second half runs it over the real seed data, which is the
 * invariant LEARNING_ENGINE.md §2 actually asserts: the skill graph is a DAG.
 *
 * The seed list is read from disk rather than duplicated here — a copy would
 * pass forever while the real graph rotted.
 */

const SEED_EDGES: PrerequisiteEdge[] = JSON.parse(
  readFileSync('scripts/seed/prerequisites.json', 'utf8'),
)

describe('findCycle', () => {
  it('accepts a graph with no cycle', () => {
    expect(
      findCycle([
        ['b', 'a'],
        ['c', 'b'],
        ['d', 'b'],
      ]),
    ).toBeNull()
  })

  it('accepts a diamond — two paths to one node is not a cycle', () => {
    expect(
      findCycle([
        ['b', 'a'],
        ['c', 'a'],
        ['d', 'b'],
        ['d', 'c'],
      ]),
    ).toBeNull()
  })

  it('finds a two-node cycle', () => {
    const cycle = findCycle([
      ['a', 'b'],
      ['b', 'a'],
    ])
    expect(cycle).not.toBeNull()
    expect(new Set(cycle)).toEqual(new Set(['a', 'b']))
  })

  it('finds a long cycle', () => {
    const cycle = findCycle([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
    ])
    expect(cycle).not.toBeNull()
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('finds a self-loop', () => {
    expect(findCycle([['a', 'a']])).toEqual(['a', 'a'])
  })

  it('finds a cycle that is not reachable from the first node visited', () => {
    const cycle = findCycle([
      ['a', 'b'],
      ['x', 'y'],
      ['y', 'x'],
    ])
    expect(new Set(cycle)).toEqual(new Set(['x', 'y']))
  })

  it('returns the loop itself, not the walk that reached it', () => {
    // start -> a -> b -> a. 'start' is on the path but not in the cycle.
    const cycle = findCycle([
      ['start', 'a'],
      ['a', 'b'],
      ['b', 'a'],
    ])
    expect(cycle).not.toContain('start')
  })

  it('handles an empty graph', () => {
    expect(findCycle([])).toBeNull()
  })
})

describe('the seeded skill graph', () => {
  it('is a DAG, as LEARNING_ENGINE.md §2 requires', () => {
    expect(findCycle(SEED_EDGES)).toBeNull()
  })

  it('has no self-referencing prerequisite', () => {
    expect(SEED_EDGES.filter(([a, b]) => a === b)).toEqual([])
  })

  it('has no duplicate edges', () => {
    const keys = SEED_EDGES.map(([a, b]) => `${a}->${b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every endpoint is a node the seeder will create', () => {
    // Derived from the ids themselves: a leaf is 'topic/leaf', a topic is its
    // own id, so the node set is implied by the edge list plus its parents.
    const ids = new Set<string>()
    for (const [a, b] of SEED_EDGES) {
      for (const id of [a, b]) {
        ids.add(id)
        const slash = id.indexOf('/')
        if (slash > -1) ids.add(id.slice(0, slash))
      }
    }
    expect(danglingEndpoints(SEED_EDGES, ids)).toEqual([])
  })
})

/*
 * The combined graph — M-DS task a.
 *
 * Acyclicity matters more now than it did at 62 edges. The Data & ML track is
 * genuinely denser (74 edges over 168 nodes), seven of its edges reach back
 * into the engineering graph, and a cycle across that seam is exactly the kind
 * nobody spots by reading: the scheduler would simply never offer one of the
 * nodes involved, silently, forever.
 *
 * Everything is parsed from the documents through the same module the seeders
 * use, so this test and the seed cannot agree with each other while both
 * disagree with the curriculum.
 */
const TRACK_DOC = readFileSync('docs/DATA_ML_TRACK.md', 'utf8')
const ENGINE_DOC = readFileSync('docs/LEARNING_ENGINE.md', 'utf8')

const ENGINEERING_NODES = parseTree(ENGINE_DOC, '## 2. Skill graph', 0)
const DATA_ML_NODES = parseTree(TRACK_DOC, '### 9.1')
const DATA_ML_EDGES: PrerequisiteEdge[] = parseEdges(TRACK_DOC, '### 9.4').map(
  ([a, b]) => [a, b] as PrerequisiteEdge,
)
const ALL_EDGES: PrerequisiteEdge[] = [...SEED_EDGES, ...DATA_ML_EDGES]
const ALL_IDS = new Set([...ENGINEERING_NODES, ...DATA_ML_NODES].map((n) => n.id))

describe('the combined skill graph', () => {
  it('has the node counts both documents claim', () => {
    expect(ENGINEERING_NODES).toHaveLength(207)
    expect(DATA_ML_NODES).toHaveLength(168)
    expect(ALL_IDS.size).toBe(375)
  })

  it('has no id collision between the two tracks', () => {
    // The set being the full sum is the assertion: a collision would shrink it.
    const ids = [...ENGINEERING_NODES, ...DATA_ML_NODES].map((n) => n.id)
    expect(ALL_IDS.size).toBe(ids.length)
  })

  it('has the edge counts both documents claim', () => {
    expect(SEED_EDGES).toHaveLength(79)
    expect(DATA_ML_EDGES).toHaveLength(74)
    expect(ALL_EDGES).toHaveLength(153)
  })

  it('is a DAG across both tracks', () => {
    expect(findCycle(ALL_EDGES)).toBeNull()
  })

  it('every endpoint is a node one of the seeders will create', () => {
    expect(danglingEndpoints(ALL_EDGES, ALL_IDS)).toEqual([])
  })

  it('has no duplicate edge, within or across tracks', () => {
    const keys = ALL_EDGES.map(([a, b]) => `${a}->${b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has exactly the seven cross-track edges §9.4 marks with a diamond', () => {
    const dataMlIds = new Set(DATA_ML_NODES.map((n) => n.id))
    const crossing = DATA_ML_EDGES.filter(
      ([skill, requires]) => !dataMlIds.has(skill) || !dataMlIds.has(requires),
    )
    expect(crossing).toHaveLength(7)
    // Each one requires an engineering node — never the other way round. The
    // Data & ML track builds on the engineering graph, not the reverse.
    const engineeringIds = new Set(ENGINEERING_NODES.map((n) => n.id))
    for (const [skill, requires] of crossing) {
      expect(dataMlIds.has(skill)).toBe(true)
      expect(engineeringIds.has(requires)).toBe(true)
    }
  })

  it('the dsa subtree is a chain, not an island — M-DS ruling 7', () => {
    const dsa = DATA_ML_EDGES.concat(SEED_EDGES).filter(
      ([skill, requires]) => skill.startsWith('dsa/') && requires.startsWith('dsa/'),
    )
    expect(dsa).toHaveLength(17)

    // Every dsa leaf except the root of the chain is reachable from
    // arrays-hashing. A pattern with no path back to the start is one the
    // scheduler can offer before its prerequisites, which is the whole point
    // of following the roadmap order.
    const requiredBy = new Map<string, string[]>()
    for (const [skill, requires] of dsa) {
      requiredBy.set(requires, [...(requiredBy.get(requires) ?? []), skill])
    }
    const seen = new Set<string>(['dsa/arrays-hashing'])
    const queue = ['dsa/arrays-hashing']
    while (queue.length > 0) {
      for (const next of requiredBy.get(queue.pop()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    const leaves = ENGINEERING_NODES.filter(
      (n) => n.topic === 'dsa' && n.parentId !== null,
    )
    expect(leaves).toHaveLength(16)
    expect(leaves.filter((n) => !seen.has(n.id))).toEqual([])
  })

  it('gives every topic in both tracks exactly one phase', () => {
    const phases = parsePhases(TRACK_DOC, '### 9.2', '### 9.3')
    const topics = [...ENGINEERING_NODES, ...DATA_ML_NODES]
      .filter((n) => n.parentId === null)
      .map((n) => n.id)

    expect(topics).toHaveLength(59)
    expect(topics.filter((t) => !phases.has(t))).toEqual([])
    expect([...phases.keys()].filter((t) => !topics.includes(t))).toEqual([])
  })

  it('never requires a skill from a later phase', () => {
    /*
     * A prerequisite that sits in a later phase than the skill needing it is
     * unreachable by construction: the phase filter hides the requirement
     * while offering the thing that depends on it. This is the ordering bug
     * the acyclicity check cannot see.
     */
    const phases = parsePhases(TRACK_DOC, '### 9.2', '### 9.3')
    const phaseOf = (id: string) => phases.get(id.split('/')[0] ?? id)
    const rank = (phase: string | undefined) =>
      phase === undefined ? -1 : Number(phase.slice(1))

    const inverted = ALL_EDGES.filter(([skill, requires]) => {
      const a = phaseOf(skill)
      const b = phaseOf(requires)
      // Only comparable within a track: E and D numbering run in parallel.
      if (a === undefined || b === undefined || a[0] !== b[0]) return false
      return rank(b) > rank(a)
    })

    expect(inverted).toEqual([])
  })
})
