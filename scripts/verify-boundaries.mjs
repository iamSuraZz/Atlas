#!/usr/bin/env node
/*
 * Regression guard for the architecture boundaries in eslint.config.mjs.
 *
 * A lint rule that silently stops working is worse than no rule, because the
 * codebase drifts while CI stays green. This lints in-memory fixtures through
 * the ESLint API and fails if a violation is NOT reported — the inverse of a
 * normal lint run. Nothing is written to disk.
 *
 * Run: npm run verify:boundaries
 */
import { ESLint } from 'eslint'

/** @type {{name: string, filePath: string, code: string, expect: 'error'|'clean'}[]} */
const CASES = [
  // --- domain purity: the invariant everything else depends on ---
  {
    name: 'domain imports Next.js',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { NextResponse } from 'next/server'\nexport const a = NextResponse\n",
    expect: 'error',
  },
  {
    name: 'domain imports React',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { useState } from 'react'\nexport const a = useState\n",
    expect: 'error',
  },
  {
    name: 'domain imports infra via @/ alias',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { db } from '@/infra/db/client'\nexport const a = db\n",
    expect: 'error',
  },
  {
    name: 'domain imports infra via relative escape',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { pool } from '../../infra/db/pool'\nexport const a = pool\n",
    expect: 'error',
  },
  {
    name: 'domain imports infra as type-only',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import type { Row } from '@/infra/db/types'\nexport type A = Row\n",
    expect: 'error',
  },
  {
    name: 'domain imports a database package',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { eq } from 'drizzle-orm'\nexport const a = eq\n",
    expect: 'error',
  },
  {
    name: 'domain imports an AI SDK',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import A from '@anthropic-ai/sdk'\nexport const a = A\n",
    expect: 'error',
  },

  // --- gateway and repository boundaries ---
  {
    name: 'app route bypasses the repository layer',
    filePath: 'src/app/api/_fixture.ts',
    code: "import { drizzle } from 'drizzle-orm/node-postgres'\nexport const a = drizzle\n",
    expect: 'error',
  },
  {
    name: 'component bypasses the AI gateway',
    filePath: 'src/components/_fixture.ts',
    code: "import A from '@anthropic-ai/sdk'\nexport const a = A\n",
    expect: 'error',
  },

  // --- negative controls: a blanket ban would be useless ---
  {
    name: 'infra/db may import drizzle',
    filePath: 'src/infra/db/_fixture.ts',
    code: "import { eq } from 'drizzle-orm'\nexport const a = eq\n",
    expect: 'clean',
  },
  {
    name: 'infra/ai may import an AI SDK',
    filePath: 'src/infra/ai/_fixture.ts',
    code: "import A from '@anthropic-ai/sdk'\nexport const a = A\n",
    expect: 'clean',
  },
  {
    name: 'domain may import domain',
    filePath: 'src/domain/scheduler/_fixture.ts',
    code: "import { ok } from '../shared/result'\nexport const a = ok\n",
    expect: 'clean',
  },
]

const RULE = '@typescript-eslint/no-restricted-imports'
const eslint = new ESLint()
let failed = 0

for (const c of CASES) {
  const [result] = await eslint.lintText(c.code, { filePath: c.filePath })
  const hits = (result?.messages ?? []).filter((m) => m.ruleId === RULE)
  const ok = c.expect === 'error' ? hits.length > 0 : hits.length === 0
  if (!ok) failed++
  const mark = ok ? '  ok  ' : ' FAIL '
  console.log(`${mark}${c.expect === 'error' ? 'blocked' : 'allowed'}: ${c.name}`)
  if (!ok && c.expect === 'clean') console.log(`        unexpected: ${hits[0]?.message}`)
}

console.log(
  failed === 0
    ? `\n${CASES.length} boundary cases verified.`
    : `\n${failed} of ${CASES.length} boundary cases FAILED — the architecture rule is not doing its job.`,
)
process.exit(failed === 0 ? 0 : 1)
