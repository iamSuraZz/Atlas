#!/usr/bin/env node
/*
 * Every seeder, in dependency order. M-DS ruling 5.
 *
 *   npm run db:seed          (development)
 *   npm run db:seed:prod     (production)
 *   …add --dry-run to validate every count and write nothing.
 *
 * Before this existed, `db:seed:prod` ran the skills seeder alone — so a
 * production database could end up with 375 skill nodes, no phases, no
 * resources and no project ladder, and nothing would say so. A "seed" command
 * that seeds some of the data is worse than one that does not exist, because
 * the result looks finished.
 *
 * Each stage re-confirms the target and prints the branch before its first
 * write. That is repetitive on purpose: the printout is the operator's record
 * of where each stage went, and a stage that ran without printing is a stage
 * nobody can audit afterwards.
 */
import { spawnSync } from 'node:child_process'

const dryRun = process.argv.includes('--dry-run')

const STAGES = [
  {
    name: 'Engineering skill graph',
    script: 'scripts/seed-skills.mjs',
    what: '207 nodes, 79 prerequisite edges, role profiles',
  },
  {
    name: 'Data & ML track',
    script: 'scripts/seed-track.mjs',
    what: '168 nodes, 74 edges, phases, resources, the project ladder',
  },
]

console.log(
  `Seeding ${STAGES.length} stages${dryRun ? ' (--dry-run)' : ''}. ` +
    `Each confirms its target before writing.\n`,
)

for (const [index, stage] of STAGES.entries()) {
  console.log(`━━ ${index + 1}/${STAGES.length}  ${stage.name}`)
  console.log(`   ${stage.what}\n`)

  /*
   * A child process rather than an import, so a stage that calls process.exit
   * on a count mismatch stops this run instead of taking the whole node
   * process down mid-sequence with no summary.
   *
   * npm_lifecycle_event is inherited, which is what keeps the :prod intent
   * check working across the boundary — a child of `db:seed:prod` is still a
   * production run.
   */
  const result = spawnSync(
    process.execPath,
    [stage.script, ...(dryRun ? ['--dry-run'] : [])],
    { stdio: 'inherit', env: process.env },
  )

  if (result.status !== 0) {
    console.error(`\n${stage.name} failed (exit ${result.status}). Stopping.`)
    console.error('Earlier stages have already been applied; re-running is safe.')
    process.exit(1)
  }
  console.log('')
}

console.log(dryRun ? 'All stages validated. Nothing written.' : 'All stages complete.')
