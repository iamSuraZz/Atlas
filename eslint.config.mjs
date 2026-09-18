import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/*
 * Architecture boundaries are enforced here, not by convention.
 *
 * The central rule: src/domain/ is pure TypeScript. It imports no framework,
 * no database client, and no AI SDK. That is what keeps the scheduler and
 * mastery engine — the two components most likely to be wrong — unit-testable
 * in milliseconds without a database. Retrofitting the boundary later is a
 * rewrite, so it is enforced from the first commit.
 *
 * See docs/ARCHITECTURE.md §2 and CLAUDE.md rule 1.
 */

const AI_SDKS = ['@anthropic-ai/*', 'openai', 'openai/*', 'ai', 'ai/*']
const DB_PKGS = [
  'drizzle-orm',
  'drizzle-orm/*',
  'drizzle-kit',
  '@neondatabase/*',
  'postgres',
  'pg',
]
const VERCEL_PKGS = ['@vercel/*']

const g = (group, message) => ({ group, message })

/** Ban list for everything under src/, with per-directory exemptions below. */
const appBoundaries = (allow = []) => {
  const groups = []
  if (!allow.includes('ai'))
    groups.push(
      g(AI_SDKS, 'AI SDKs belong in src/infra/ai/ only. Call the gateway instead.'),
    )
  if (!allow.includes('db'))
    groups.push(
      g(DB_PKGS, 'Database clients belong in src/infra/db/ only. Use a repository.'),
    )
  if (!allow.includes('vercel'))
    groups.push(
      g(VERCEL_PKGS, 'Vercel-specific code belongs in src/infra/vercel/ only (ADR-016).'),
    )
  return ['error', { patterns: groups }]
}

/** src/domain/ is pure. Type-only imports are banned too — domain owns its types. */
const domainPurity = [
  'error',
  {
    patterns: [
      g(['next', 'next/*'], 'domain/ must not import Next.js. Keep it framework-free.'),
      g(
        ['react', 'react-dom', 'react/*', 'react-dom/*'],
        'domain/ must not import React. It is logic, not UI.',
      ),
      g(
        ['@/infra', '@/infra/*', '**/infra/**', '@/app/*', '**/app/**'],
        'domain/ must not import infrastructure. Dependencies point inward: infra depends on domain.',
      ),
      g(DB_PKGS, 'domain/ must not touch the database. Accept data as arguments.'),
      g(
        AI_SDKS,
        'domain/ must not call a model. Accept evaluation results as arguments.',
      ),
      g(
        ['better-auth', 'better-auth/*', 'ioredis', '@upstash/*', ...VERCEL_PKGS],
        'domain/ must not import infrastructure packages.',
      ),
      g(
        ['server-only', 'client-only'],
        'domain/ is environment-agnostic and runs in tests without either.',
      ),
    ],
  },
]

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: 'atlas/rules',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-imports': 'off',
    },
  },

  // Default boundaries for all application code.
  {
    name: 'atlas/boundaries/app',
    files: ['src/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': appBoundaries() },
  },

  // The three directories permitted to touch their own infrastructure.
  {
    name: 'atlas/boundaries/infra-ai',
    files: ['src/infra/ai/**/*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': appBoundaries(['ai']) },
  },
  {
    name: 'atlas/boundaries/infra-db',
    files: ['src/infra/db/**/*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': appBoundaries(['db']) },
  },
  {
    name: 'atlas/boundaries/infra-vercel',
    files: ['src/infra/vercel/**/*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': appBoundaries(['vercel']) },
  },

  // The domain layer. Strictest, and last so it wins.
  {
    name: 'atlas/boundaries/domain',
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': domainPurity,
      'no-console': 'error',
    },
  },

  // CLI tooling: printing is the entire job.
  {
    name: 'atlas/scripts',
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'private/**',
    'drizzle/**',
  ]),
])
