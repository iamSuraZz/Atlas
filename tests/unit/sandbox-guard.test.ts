import { describe, expect, it } from 'vitest'
import { deletionRefusal } from '@/lib/sandbox-branch'

/*
 * ADR-018's sandbox drop path. M-DS ruling 4.
 *
 * This is the only code in the application that can destroy a database. The
 * caller today always passes an id it just created, but "the caller is
 * careful" is not a control, and the failure is unrecoverable.
 */

const PINS = { development: 'br-hidden-sound-b4yvsxj4', production: 'br-prod-9' }
const NO_PINS = { development: null, production: null }

describe('deletionRefusal', () => {
  it('allows a mission sandbox', () => {
    expect(deletionRefusal('br-tmp-1', 'mission-abc123', PINS)).toBeNull()
  })

  it('refuses the pinned development branch, whatever it is called', () => {
    expect(deletionRefusal(PINS.development, 'mission-abc', PINS)).toMatch(/pinned/)
  })

  it('refuses the production branch, whatever it is called', () => {
    expect(deletionRefusal(PINS.production, 'mission-abc', PINS)).toMatch(/pinned/)
  })

  it('refuses a branch whose name is not a mission sandbox', () => {
    expect(deletionRefusal('br-tmp-1', 'main', PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'production', PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'dev', PINS)).toMatch(/mission-/)
  })

  it('refuses when the name could not be read', () => {
    // A branch whose name the API did not return is a branch we know nothing
    // about, which is not the same as a branch that is safe.
    expect(deletionRefusal('br-tmp-1', null, PINS)).toMatch(/mission-/)
  })

  it('refuses every near-miss on the prefix', () => {
    // A prefix check is only as good as its edges: an extra letter, a prefix
    // in the middle, or the wrong case are all branches somebody named.
    expect(deletionRefusal('br-tmp-1', 'missions-abc', PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'my-mission-abc', PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'Mission-abc', PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'mission', PINS)).toMatch(/mission-/)
    // ...and the exact prefix still passes.
    expect(deletionRefusal('br-tmp-1', 'mission-', PINS)).toBeNull()
  })

  it('still enforces the name rule when no pins are configured', () => {
    expect(deletionRefusal('br-tmp-1', 'main', NO_PINS)).toMatch(/mission-/)
    expect(deletionRefusal('br-tmp-1', 'mission-x', NO_PINS)).toBeNull()
  })

  it('does not treat a null branch id as matching a null pin', () => {
    // pins are null when unset; an unnamed branch must not slip through by
    // comparing equal to them.
    expect(deletionRefusal('', null, NO_PINS)).toMatch(/mission-/)
  })
})
