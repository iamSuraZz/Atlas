import { describe, expect, it } from 'vitest'
import {
  ALL_PHASES,
  formatActivePhases,
  groupActivePhases,
  predecessorOf,
  skipsAhead,
} from '@/lib/phases'

/*
 * Phase ordering and the skip-ahead rule. M-DS rulings 15 and 16.
 */

describe('ordering — ruling 15', () => {
  it('groups by track, in curriculum order', () => {
    const { engineering, dataMl } = groupActivePhases(['D0', 'E2', 'E1'])
    expect(engineering).toEqual(['E1', 'E2'])
    expect(dataMl).toEqual(['D0'])
  })

  it('formats as curriculum order, not alphabetical', () => {
    // Alphabetically this is "D0, E1, E2" — which reads as though the data
    // track comes first.
    expect(formatActivePhases(['D0', 'E1', 'E2'])).toBe('E1, E2 · D0')
  })

  it('puts D10 last, not between D1 and D2', () => {
    expect(formatActivePhases(['D10', 'D2', 'D1'])).toBe('D1, D2, D10')
  })

  it('omits an empty track rather than leaving a stray separator', () => {
    expect(formatActivePhases(['D0'])).toBe('D0')
    expect(formatActivePhases(['E1'])).toBe('E1')
    expect(formatActivePhases([])).toBe('')
  })

  it('ignores a phase that is not in the curriculum', () => {
    expect(formatActivePhases(['E1', 'D99'])).toBe('E1')
  })
})

describe('skipping ahead — ruling 16', () => {
  it('has no predecessor for the first phase of either track', () => {
    expect(predecessorOf('E1')).toBeNull()
    expect(predecessorOf('D0')).toBeNull()
  })

  it('knows the predecessor inside a track', () => {
    expect(predecessorOf('E2')).toBe('E1')
    expect(predecessorOf('D1')).toBe('D0')
    // D9 does not exist, so D10 follows D8.
    expect(predecessorOf('D10')).toBe('D8')
  })

  it('never crosses tracks', () => {
    // D0 is the start of its own track, not "after E6".
    expect(predecessorOf('D0')).toBeNull()
    expect(predecessorOf('E1')).toBeNull()
  })

  it('does not confirm normal progression', () => {
    expect(skipsAhead('E2', ['E1'])).toBeNull()
    expect(skipsAhead('D1', ['E1', 'E2', 'D0'])).toBeNull()
  })

  it('does not confirm the first phase of a track', () => {
    expect(skipsAhead('E1', [])).toBeNull()
    expect(skipsAhead('D0', [])).toBeNull()
  })

  it('confirms when the predecessor is not active', () => {
    expect(skipsAhead('D5', ['E1', 'E2', 'D0'])).toBe('D4')
    expect(skipsAhead('E4', ['E1', 'E2'])).toBe('E3')
  })

  it('checks only the immediate predecessor', () => {
    // A confirmation that fires forever after one deliberate skip is one
    // nobody reads.
    expect(skipsAhead('D6', ['D5'])).toBeNull()
  })

  it('has an opinion about every phase in the curriculum', () => {
    for (const phase of ALL_PHASES) {
      expect(() => skipsAhead(phase, [])).not.toThrow()
    }
  })
})
