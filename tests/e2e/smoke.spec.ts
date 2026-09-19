import { expect, test } from '@playwright/test'

/*
 * What M0 can honestly cover end to end.
 *
 * ADR-008 names five E2E flows — complete a mission, run a deep dive, finish
 * the baseline, log evidence, switch intensity. Every one of them belongs to
 * M1–M3 and none exist yet, so asserting them now would be testing nothing.
 *
 * CI also runs without a database (see .github/workflows/ci.yml), so anything
 * behind sign-in is out of reach here. These specs assert contracts that hold
 * identically with and without a connection — which means they cannot rot into
 * "passes only on the machine that has a .env.local".
 */

test('liveness is independent of the database', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok', check: 'liveness' })
})

test('readiness reports database state, and its status code agrees with its body', async ({
  request,
}) => {
  const response = await request.get('/api/health/deep')
  const body = await response.json()

  expect(body.check).toBe('readiness')
  expect(typeof body.database.reachable).toBe('boolean')

  /*
   * The assertion is the agreement, not the value: 200 when reachable and 503
   * when not. That holds in CI with no database and locally with one, so the
   * test never has to know which environment it is in.
   */
  expect(response.status()).toBe(body.database.reachable ? 200 : 503)
  expect(body.status).toBe(body.database.reachable ? 'ok' : 'error')

  // The endpoint is unauthenticated; a connection string must never reach it.
  expect(JSON.stringify(body)).not.toMatch(/postgres(ql)?:\/\//i)
})

test('sign-in renders both credential routes and keeps focus visible', async ({
  page,
}) => {
  await page.goto('/sign-in')

  const passkey = page.getByRole('button', { name: 'Sign in with a passkey' })
  await expect(passkey).toBeVisible()
  await expect(page.getByLabel('Or send a sign-in link')).toBeVisible()

  // UX_PLAN §6: visible focus rings, never removed.
  await passkey.focus()
  await page.waitForTimeout(220) // outline-color is inside transition-colors duration-150
  const outline = await passkey.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).toBe('2px')
  // --accent, #E8A33D
  expect(outline.color).toBe('rgb(232, 163, 61)')
})

test('the root path sends you to TODAY', async ({ request }) => {
  const response = await request.get('/', { maxRedirects: 0 })

  expect([307, 308]).toContain(response.status())
  expect(response.headers()['location']).toContain('/today')
})
