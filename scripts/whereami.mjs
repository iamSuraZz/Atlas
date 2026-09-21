#!/usr/bin/env node
/*
 * Answers one question: which database am I actually pointed at?
 *
 * Read-only, so it never refuses — it is most useful precisely when something
 * is misconfigured, and a tool that exits before telling you what is wrong is
 * no help. It prints the connection's own account of itself, the migrations
 * that have been applied, and the row counts, then reports whether a write
 * would have been allowed.
 *
 * Exits non-zero only on a declaration problem — the env file disagreeing with
 * the connection — because that is wrong for reads too. "This command may not
 * write here" is expected on a development run and is reported, not fatal.
 *
 *   npm run db:where                                       (development)
 *   node --env-file=.env.production.local scripts/whereami.mjs   (production)
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { checkTarget, describeTarget, formatTarget } from './lib/branch-guard.mjs'

const connectionString = process.env.DATABASE_URL_UNPOOLED
if (!connectionString) {
  console.error('DATABASE_URL_UNPOOLED is not set in the env file you loaded.')
  process.exit(1)
}

const sql = neon(connectionString)
const target = await describeTarget(connectionString)
console.log(formatTarget(target, 'inspection'))

// ── migrations ────────────────────────────────────────────────────────────
//
// drizzle-kit stamps each applied row's created_at with the journal entry's
// `when`, so the two join exactly. Anything in the journal without a matching
// row has not been applied here, which is the whole point of asking.
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
let applied = new Map()
let migrationsReadable = true

try {
  const rows = await sql`SELECT created_at FROM drizzle.__drizzle_migrations`
  applied = new Map(rows.map((r) => [String(r.created_at), true]))
} catch {
  // The table only exists once something has been migrated here.
  migrationsReadable = false
}

console.log('\nMigrations:')
if (!migrationsReadable) {
  console.log('  drizzle.__drizzle_migrations does not exist — nothing applied here.')
} else {
  for (const entry of journal.entries) {
    const mark = applied.has(String(entry.when)) ? 'applied' : 'MISSING'
    console.log(`  ${mark.padEnd(8)} ${entry.tag}`)
  }
  const pending = journal.entries.filter((e) => !applied.has(String(e.when)))
  console.log(
    pending.length === 0
      ? `  all ${journal.entries.length} committed migrations are applied.`
      : `  ${pending.length} of ${journal.entries.length} NOT applied.`,
  )
}

// ── row counts ────────────────────────────────────────────────────────────
//
// The table list comes from the database rather than a hard-coded list, so a
// table added later is not silently omitted from the count nobody re-reads.
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name`

console.log(
  `\nRow counts in ${target.database} @ ${target.branchId ?? 'unknown branch'}:`,
)
if (tables.length === 0) {
  console.log('  no tables in schema public.')
} else {
  const union = tables
    .map(
      (t) => `SELECT '${t.table_name}' AS t, count(*)::int AS n FROM "${t.table_name}"`,
    )
    .join(' UNION ALL ')
  const counts = await sql.query(`${union} ORDER BY t`)
  const width = Math.max(...tables.map((t) => t.table_name.length))
  for (const row of counts) {
    console.log(`  ${row.t.padEnd(width)}  ${String(row.n).padStart(5)}`)
  }
}

// ── would a write have been allowed? ──────────────────────────────────────
const problems = checkTarget(target)
console.log('')
if (problems.length === 0) {
  console.log('A write from this env file would be allowed.')
} else {
  for (const p of problems) console.log(`[${p.kind}] ${p.message}`)
}

if (target.declaredEnv !== 'production' && target.productionBranchId === null) {
  console.log(
    '\nNote: ATLAS_PROD_BRANCH_ID is unset, so the independent production deny-list\n' +
      'is not armed. Set it in this env file to the production branch id.',
  )
}

process.exit(problems.some((p) => p.kind === 'declaration') ? 1 : 0)
