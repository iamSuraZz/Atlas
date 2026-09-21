#!/usr/bin/env node
/*
 * Seeds the Data & ML track — M-DS task a.
 *
 *   npm run db:seed:track              (add --dry-run to validate and stop)
 *
 * Four seeders, each owning its own counts and refusing to run if the document
 * has drifted from them. All four validate BEFORE anything connects: a parse
 * that has gone wrong should cost nothing, and the failure should name the
 * section that changed rather than a foreign key violation halfway through.
 *
 * Order is not arbitrary. Phases must be assigned before resources and
 * projects, because both derive their skill links by joining on `skill.phase`.
 */
import { neon } from '@neondatabase/serverless'
import { WrongTargetError, assertWritableTarget } from './lib/branch-guard.mjs'
import * as dataMl from './seed/data-ml.mjs'
import * as phases from './seed/phases.mjs'
import * as projects from './seed/projects.mjs'
import * as resources from './seed/resources.mjs'

const dryRun = process.argv.includes('--dry-run')

// ── 1. parse and validate, with nothing connected ─────────────────────────
const graph = dataMl.load()
const phaseMap = phases.load()
const resourceList = resources.load()
const projectList = projects.load()

const summary = {
  graph: dataMl.validate(graph),
  phases: phases.validate(phaseMap),
  resources: resources.validate(resourceList),
  projects: projects.validate(projectList),
}

console.log('Parsed docs/DATA_ML_TRACK.md — every count matches the document:')
console.log(
  `  graph       ${summary.graph.nodes} nodes (${summary.graph.topics} topics + ` +
    `${summary.graph.leaves} leaves), ${summary.graph.edges} edges, ` +
    `${summary.graph.crossTrack} of them into the engineering graph`,
)
console.log(`  phases      ${summary.phases.topics} topic assignments across both tracks`)
console.log(
  `  resources   ${summary.resources.total} — ` +
    Object.entries(summary.resources.byKind)
      .map(([k, n]) => `${k} ${n}`)
      .join(', '),
)
console.log(
  `  projects    ${summary.projects.total}, ${summary.projects.maxHours}h at the top of each range`,
)

if (dryRun) {
  console.log('\n--dry-run: nothing written.')
  process.exit(0)
}

// ── 2. confirm where we are, then write ───────────────────────────────────
const connectionString = process.env.DATABASE_URL_UNPOOLED
console.log('')

try {
  await assertWritableTarget(connectionString, 'seed the Data & ML track')
} catch (error) {
  if (error instanceof WrongTargetError) console.error(`\n${error.message}`)
  else console.error('Seed failed:', error)
  process.exit(1)
}

const sql = neon(connectionString)

const [user] = await sql`SELECT id FROM app_user LIMIT 1`
const userId = user?.id ?? null
if (userId === null) {
  console.warn(
    '\nNo app_user row: skill_state, the role blend and active phases will not\n' +
      'be seeded. The graph, resources and projects still will.',
  )
}

console.log('\nWriting:')
await dataMl.seed(sql, graph, userId)
console.log(`  graph       ${summary.graph.nodes} nodes, ${summary.graph.edges} edges`)

const phaseCounts = await phases.seed(sql, phaseMap, userId)
console.log(
  `  phases      ${phaseCounts.topics} topics assigned, ${phaseCounts.leaves} leaves inherited`,
)

const resourceCounts = await resources.seed(sql, resourceList)
console.log(
  `  resources   ${resourceCounts.resources} rows, ${resourceCounts.links} derived skill links`,
)

const projectCounts = await projects.seed(sql, projectList)
console.log(
  `  projects    ${projectCounts.projects} rows, ${projectCounts.links} derived skill links`,
)

// ── 3. report what is now in the database ─────────────────────────────────
const [where] = await sql`
  SELECT current_database() AS db, current_setting('neon.branch_id', true) AS branch`
console.log(`\n═══ ${where.db} @ ${where.branch} ═══`)

const byTrack = await sql`
  SELECT track, count(*)::int AS total,
         count(*) FILTER (WHERE parent_id IS NULL)::int AS topics
  FROM skill GROUP BY track ORDER BY track`
console.log('\nBy track')
for (const r of byTrack) {
  console.log(
    `  ${r.track.padEnd(12)} ${String(r.total).padStart(4)}  (${r.topics} topics)`,
  )
}
console.log(
  `  ${'TOTAL'.padEnd(12)} ${String(byTrack.reduce((n, r) => n + r.total, 0)).padStart(4)}`,
)

const byCategory = await sql`
  SELECT track, category::text AS category, count(*)::int AS n
  FROM skill GROUP BY track, category ORDER BY track, category`
console.log('\nBy category')
for (const r of byCategory) {
  console.log(
    `  ${r.track.padEnd(12)} ${r.category.padEnd(18)} ${String(r.n).padStart(4)}`,
  )
}

const byPhase = await sql`
  SELECT s.phase, s.track, count(*)::int AS n,
         bool_or(ap.phase IS NOT NULL) AS active
  FROM skill s
  LEFT JOIN active_phase ap ON ap.phase = s.phase
  GROUP BY s.phase, s.track
  ORDER BY s.track, left(s.phase, 1), (substr(s.phase, 2))::int`
console.log('\nBy phase   (● = active now)')
for (const r of byPhase) {
  const mark = r.active ? '●' : ' '
  console.log(
    `  ${mark} ${(r.phase ?? '(none)').padEnd(8)} ${r.track.padEnd(12)} ${String(r.n).padStart(4)}`,
  )
}

const [extra] = await sql`
  SELECT (SELECT count(*)::int FROM skill_prerequisite) AS edges,
         (SELECT count(*)::int FROM resource) AS resources,
         (SELECT count(*)::int FROM resource_skill) AS resource_links,
         (SELECT count(*)::int FROM build_project) AS projects,
         (SELECT count(*)::int FROM build_project_skill) AS project_links,
         (SELECT count(*)::int FROM skill_state) AS skill_states`
console.log(
  `\nEdges ${extra.edges} · resources ${extra.resources} (${extra.resource_links} links) · ` +
    `projects ${extra.projects} (${extra.project_links} links) · skill_state ${extra.skill_states}`,
)

const blend = await sql`
  SELECT profile_id, share FROM user_role_blend ORDER BY profile_id`
console.log('\nRole blend')
for (const r of blend) console.log(`  ${r.profile_id.padEnd(18)} ${r.share}`)

const active = await sql`SELECT phase FROM active_phase ORDER BY phase`
console.log(`\nActive phases: ${active.map((r) => r.phase).join(', ') || '(none)'}`)
