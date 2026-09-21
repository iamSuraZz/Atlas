/*
 * The Data & ML skill graph: 168 nodes and 74 prerequisite edges.
 *
 * Parses docs/DATA_ML_TRACK.md rather than copying it, for the same reason
 * seed-skills.mjs parses LEARNING_ENGINE.md: a copy passes forever while the
 * curriculum it claims to implement rots. If the parse does not yield exactly
 * the counts the document states, nothing is written.
 *
 * Assumptions, each recorded because no source supplies the value — the same
 * four that applied to the engineering seed still apply here:
 *   1. market_weight stays at the column default 0.50. The JD analyser is M6.
 *   2. hours_to_practical is NULL. §5 gives per-PHASE hour ranges, not
 *      per-node ones, and dividing a phase budget by its node count would
 *      manufacture 139 numbers the document never states.
 *   3. role_profile_target is not seeded, for C_ML_ENGINEER or anyone else.
 *   4. Names and descriptions are derived from the taxonomy itself.
 */
import { readFileSync } from 'node:fs'
import { parseEdges, parseTree } from '../lib/skill-tree.mjs'

const EXPECTED_NODES = 168
const EXPECTED_TOPICS = 29
const EXPECTED_EDGES = 74
/** §9.4: seven edges point back into the engineering graph. */
const EXPECTED_CROSS_TRACK = 7

/*
 * §9.3. Everything not named here is CONCEPTUAL.
 *
 * "every `ds-interview/*` leaf" means the leaves, not the topic node that
 * contains them — hence the parentId test. The topic is a container nothing
 * schedules, so this is cosmetic, but a rule applied more widely than it reads
 * is the kind of drift that is only ever noticed as a surprise later.
 */
const RECALL_HEAVY = (node) =>
  (node.topic === 'ds-interview' && node.parentId !== null) ||
  node.id === 'ml-system-design/ml-design-interview'

/** §9.3. Everything else in this track can produce an objective artifact. */
const NO_ARTIFACT = new Set([
  'ds-interview/case-studies',
  'visualization/visual-storytelling',
])

const describe = (node) =>
  node.parentId === null
    ? `${node.name}: the ${node.topic} track within ${node.category}.`
    : `${node.name}, within ${node.topic} (${node.category}).`

export function load() {
  const doc = readFileSync('docs/DATA_ML_TRACK.md', 'utf8')
  const nodes = parseTree(doc, '### 9.1')
  const edges = parseEdges(doc, '### 9.4')
  return { nodes, edges }
}

/**
 * Refuses on drift. Pure — no connection — so a bad parse costs nothing and is
 * caught before the guard has even opened a connection.
 */
export function validate({ nodes, edges }) {
  const topics = nodes.filter((n) => n.parentId === null)

  if (nodes.length !== EXPECTED_NODES || topics.length !== EXPECTED_TOPICS) {
    throw new Error(
      `Parsed ${nodes.length} nodes (${topics.length} topics), expected ` +
        `${EXPECTED_NODES} (${EXPECTED_TOPICS}). §9.1 changed; update the ` +
        `constants deliberately rather than seeding a graph nobody reviewed.`,
    )
  }

  if (edges.length !== EXPECTED_EDGES) {
    throw new Error(`Parsed ${edges.length} edges, expected ${EXPECTED_EDGES}.`)
  }

  const ids = new Set(nodes.map((n) => n.id))
  if (ids.size !== nodes.length) {
    throw new Error('§9.1 contains duplicate node ids.')
  }

  // An edge endpoint outside this track must be an existing engineering node.
  // Those are the ◆ edges, and there should be exactly seven.
  const crossTrack = edges.filter(
    ([skill, requires]) => !ids.has(skill) || !ids.has(requires),
  )
  if (crossTrack.length !== EXPECTED_CROSS_TRACK) {
    throw new Error(
      `Found ${crossTrack.length} cross-track edges, expected ${EXPECTED_CROSS_TRACK}.`,
    )
  }

  return {
    nodes: nodes.length,
    topics: topics.length,
    leaves: nodes.length - topics.length,
    edges: edges.length,
    crossTrack: crossTrack.length,
  }
}

export async function seed(sql, { nodes, edges }, userId) {
  // Topics first: a leaf's parent_id must already exist.
  for (const group of [
    nodes.filter((n) => !n.parentId),
    nodes.filter((n) => n.parentId),
  ]) {
    for (const node of group) {
      await sql`
        INSERT INTO skill (id, parent_id, category, name, description, decay,
                           artifact_policy, track)
        VALUES (${node.id}, ${node.parentId}, ${node.category}, ${node.name},
                ${describe(node)},
                ${RECALL_HEAVY(node) ? 'RECALL_HEAVY' : 'CONCEPTUAL'},
                ${NO_ARTIFACT.has(node.id) ? 'NO_OBJECTIVE_ARTIFACT' : 'OBJECTIVE_ARTIFACT_AVAILABLE'},
                'DATA_ML')
        ON CONFLICT (id) DO UPDATE SET
          parent_id = EXCLUDED.parent_id, category = EXCLUDED.category,
          name = EXCLUDED.name, description = EXCLUDED.description,
          decay = EXCLUDED.decay, artifact_policy = EXCLUDED.artifact_policy,
          track = EXCLUDED.track`
    }
  }

  // Every endpoint resolves — validate() proved it — so a failure here is a
  // real foreign key problem, not a typo in the document.
  for (const [skillId, requiresId] of edges) {
    await sql`
      INSERT INTO skill_prerequisite (skill_id, requires_id)
      VALUES (${skillId}, ${requiresId})
      ON CONFLICT DO NOTHING`
  }

  if (userId !== null) {
    // Every new node starts UNASSESSED, exactly as the engineering graph did.
    await sql`
      INSERT INTO skill_state (user_id, skill_id)
      SELECT ${userId}, id FROM skill WHERE track = 'DATA_ML'
      ON CONFLICT (user_id, skill_id) DO NOTHING`

    /*
     * The blend, in ONE statement. The sum-to-1.00 trigger is DEFERRABLE
     * INITIALLY DEFERRED, so it fires at commit — and on the Neon HTTP driver
     * each statement is its own transaction. Splitting this into three updates
     * would commit an intermediate sum of 0.95 and be rejected.
     */
    await sql`
      INSERT INTO user_role_blend (user_id, profile_id, share) VALUES
        (${userId}, 'A_PRODUCT_SENIOR', 0.65),
        (${userId}, 'B_AI_PRODUCT',     0.00),
        (${userId}, 'C_ML_ENGINEER',    0.35)
      ON CONFLICT (user_id, profile_id) DO UPDATE SET share = EXCLUDED.share`
  }
}
