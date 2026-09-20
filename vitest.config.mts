import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/*
 * Unit tests only. The domain layer imports no framework, no database and no
 * AI SDK (see eslint.config.mjs), so these run in milliseconds with nothing
 * started — which is the entire reason the boundary rule exists.
 *
 * Integration tests arrive with repositories and need a real Postgres;
 * end-to-end lives in tests/e2e and is driven by Playwright.
 */
export default defineConfig({
  // Vitest does not read tsconfig paths, so the alias is declared once here.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
