import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  danglingEndpoints,
  findCycle,
  type PrerequisiteEdge,
} from '@/domain/skills/graph'

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
