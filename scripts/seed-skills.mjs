#!/usr/bin/env node
/*
 * Seeds the skill graph from docs/LEARNING_ENGINE.md §2.
 *
 * The document is the source of truth rather than a copy of it: this script
 * parses the tree, so the seed cannot silently drift from the curriculum it is
 * supposed to implement. If the parse yields an unexpected node count it
 * refuses to run.
 *
 * Idempotent. Re-running updates names and descriptions and leaves existing
 * skill_state rows untouched, so it is safe after a graph edit.
 *
 * Run: npm run db:seed          (add --dry-run to print without writing)
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { WrongTargetError, assertWritableTarget } from './lib/branch-guard.mjs'

/*
 * 207 = 30 topic nodes + 177 leaves. Was 190 until M-DS ruling 6 added the
 * `dsa` subtree; before that it was briefly reported as 187, from a parser
 * that silently dropped the wrapped brace lists for postgres and interview.
 */
const EXPECTED_NODES = 207

// ── assumptions, each recorded because no source supplies the value ────────
//
// 1. market_weight stays at the column default 0.50 for every node.
//    LEARNING_ENGINE.md §2 says it comes from JD analysis; the JD analyser is
//    M6 and has never run. One stated assumption beats 187 fabrications.
// 2. hours_to_practical is NULL. The column was made nullable in 0005 so that
//    "not estimated" is representable rather than guessed.
// 3. role_profile_target is not seeded. Per-skill targets across three
//    profiles would be 561 rows of invented target states and weights.
//    skill_state.target_state already defaults to PRACTICAL.
// 4. Names and descriptions are derived from the taxonomy itself. They state
//    where a node sits, which is true, rather than describing content nobody
//    has written yet.
// 5. Decay class is assigned by the rules below, from the examples in §3.2.

/** §3.2 gives examples, not a full mapping. These rules are that mapping. */
const DECAY_RULES = [
  /*
   * Before the ENGINEERING_CORE rule, deliberately. `dsa` sits in that
   * category but decays like interview recall, not like code you write daily:
   * a pattern untouched for a month is one you cannot produce under pressure.
   */
  { match: (_c, topic) => topic === 'dsa', decay: 'RECALL_HEAVY' },
  // "React, Node, TS — used at work"
  { match: (cat) => cat === 'ENGINEERING_CORE', decay: 'PROCEDURAL_DAILY' },
  { match: (_c, topic) => topic === 'delivery', decay: 'PROCEDURAL_DAILY' },
  // "DSA patterns, framework answers"
  { match: (_c, topic) => topic === 'interview', decay: 'RECALL_HEAVY' },
  // "Project stories — need re-rehearsal, not re-learning"
  {
    match: (_c, topic) => ['communication', 'leadership', 'product'].includes(topic),
    decay: 'NARRATIVE',
  },
  // "Isolation levels, CAP, indexing internals"
  { match: () => true, decay: 'CONCEPTUAL' },
]

/*
 * §3.1: communication has no objective artifact, so it caps at PRACTICAL
 * unless a real interview outcome unlocks it. Leadership and product are the
 * same shape — nothing the app can execute and check.
 */
const NO_ARTIFACT_TOPICS = new Set(['communication', 'leadership', 'product'])

/*
 * Prerequisites are deliberately sparse. §2 declares that each node "carries
 * prerequisites[]" but never lists them, so these are the edges that are
 * defensible on their face — ordering within a topic where one genuinely
 * cannot be done without the other. Inventing a dense graph would be design
 * dressed as data. The set grows as the curriculum is used.
 */
const PREREQUISITES = JSON.parse(readFileSync('scripts/seed/prerequisites.json', 'utf8'))

const titleCase = (slug) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

/** Parses the §2 tree into { id, parentId, category, name, topic }. */
export function parseSkillGraph(markdown) {
  const block = markdown.split('## 2. Skill graph')[1].split('```')[1]
  const nodes = []
  let category = null
  let pending = ''

  for (const raw of block.split('\n')) {
    // Strip the box-drawing characters; they carry no information.
    const line = raw.replace(/[├└│─]/g, ' ').trim()
    if (line === '') continue

    if (/^[A-Z_]+$/.test(line)) {
      category = line
      continue
    }
    if (category === null) continue

    pending = pending === '' ? line : `${pending} ${line}`
    // A topic's brace list may wrap across several lines.
    if (!pending.includes('}')) continue

    const match = pending.match(/^([a-z0-9-]+)\s*\{([^}]*)\}/)
    pending = ''
    if (!match) continue

    const [, topic, children] = match
    nodes.push({ id: topic, parentId: null, category, topic, name: titleCase(topic) })

    for (const child of children
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)) {
      nodes.push({
        id: `${topic}/${child}`,
        parentId: topic,
        category,
        topic,
        name: titleCase(child),
      })
    }
  }

  return nodes
}

const decayFor = (category, topic) =>
  DECAY_RULES.find((rule) => rule.match(category, topic)).decay

const describe = (node) =>
  node.parentId === null
    ? `${node.name}: the ${node.topic} track within ${node.category}.`
    : `${node.name}, within ${node.topic} (${node.category}).`

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const nodes = parseSkillGraph(readFileSync('docs/LEARNING_ENGINE.md', 'utf8'))

  if (nodes.length !== EXPECTED_NODES) {
    console.error(
      `Parsed ${nodes.length} nodes, expected ${EXPECTED_NODES}. The document changed; ` +
        `update EXPECTED_NODES deliberately rather than seeding a graph nobody reviewed.`,
    )
    process.exit(1)
  }

  const byCategory = {}
  for (const n of nodes) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1
  console.log(`Parsed ${nodes.length} nodes:`)
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(18)} ${String(count).padStart(3)}`)
  }

  const ids = new Set(nodes.map((n) => n.id))
  const missing = PREREQUISITES.flat().filter((id) => !ids.has(id))
  if (missing.length > 0) {
    console.error(
      `Prerequisite references unknown nodes: ${[...new Set(missing)].join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`\n${PREREQUISITES.length} prerequisite edges, all endpoints resolve.`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  // Everything above this line is parsing and validation against the document.
  // Everything below it writes. The target is confirmed here, in between.
  const connectionString = process.env.DATABASE_URL_UNPOOLED
  console.log('')
  await assertWritableTarget(connectionString, 'seed the skill graph')

  const sql = neon(connectionString)

  // Topics first: a leaf's parent_id must already exist.
  for (const group of [
    nodes.filter((n) => !n.parentId),
    nodes.filter((n) => n.parentId),
  ]) {
    for (const node of group) {
      await sql`
        INSERT INTO skill (id, parent_id, category, name, description, decay, artifact_policy)
        VALUES (${node.id}, ${node.parentId}, ${node.category}, ${node.name},
                ${describe(node)}, ${decayFor(node.category, node.topic)},
                ${NO_ARTIFACT_TOPICS.has(node.topic) ? 'NO_OBJECTIVE_ARTIFACT' : 'OBJECTIVE_ARTIFACT_AVAILABLE'})
        ON CONFLICT (id) DO UPDATE SET
          parent_id = EXCLUDED.parent_id, category = EXCLUDED.category,
          name = EXCLUDED.name, description = EXCLUDED.description,
          decay = EXCLUDED.decay, artifact_policy = EXCLUDED.artifact_policy`
    }
  }

  for (const [skillId, requiresId] of PREREQUISITES) {
    await sql`
      INSERT INTO skill_prerequisite (skill_id, requires_id) VALUES (${skillId}, ${requiresId})
      ON CONFLICT DO NOTHING`
  }

  await sql`
    INSERT INTO role_profile (id, name, description) VALUES
      ('A_PRODUCT_SENIOR', 'Product-minded senior engineer',
       'Depth in backend, data and systems, with the communication and judgement to own outcomes.'),
      ('B_AI_PRODUCT', 'AI product engineer',
       'Evaluation-first AI engineering on top of the same backend depth.'),
      ('D_HIGH_DSA', 'High-DSA track',
       'Seeded but inactive. Exists so switching tracks is a row update, not a rewrite.')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`

  const [user] = await sql`SELECT id FROM app_user LIMIT 1`
  if (user) {
    /*
     * The role blend is NOT written here. It used to be — A 0.70 / B 0.30 —
     * and once M-DS ruling 5 made db:seed run both seeders in sequence, this
     * statement and scripts/seed/data-ml.mjs fought over the same three rows:
     * this one set A and B, leaving C at 0.35 from the other, and the
     * sum-to-1.00 trigger rejected the result.
     *
     * One writer. scripts/seed/data-ml.mjs owns the blend, because the blend
     * is a statement about which track you are on.
     */

    // Every node starts UNASSESSED. No baseline exists.
    await sql`
      INSERT INTO skill_state (user_id, skill_id)
      SELECT ${user.id}, id FROM skill
      ON CONFLICT (user_id, skill_id) DO NOTHING`
  } else {
    console.warn('No app_user row: blend and skill_state not seeded.')
  }

  console.log('\nSeed complete.')
}

// Only run when invoked directly; the parser is imported by the unit test.
if (process.argv[1] && process.argv[1].endsWith('seed-skills.mjs')) {
  await main().catch((error) => {
    // A refusal is an operator-facing message, not a crash.
    if (error instanceof WrongTargetError) console.error(`\n${error.message}`)
    else console.error('Seed failed:', error)
    process.exit(1)
  })
}
