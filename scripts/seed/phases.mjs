/*
 * Curriculum phases for every node in both tracks, and the phases that are
 * active right now.
 *
 * DATA_ML_TRACK.md §9.2 assigns a phase to each of the 58 TOPICS. Leaves
 * inherit from their parent: the scheduler filters candidates, candidates are
 * leaves, and making it join to the parent on every scoring pass to learn the
 * same value is cost with no information.
 *
 * One thing §9.2 asks for that a single column cannot hold: D8 is "nlp plus
 * the existing AI_ENGINEERING topics, cross-listed". Those topics keep their
 * primary phase E4. Reaching them from D8 is done by activating E4 alongside
 * D8 — a row here, not a schema change.
 */
import { readFileSync } from 'node:fs'
import { parsePhases } from '../lib/skill-tree.mjs'

/** 30 engineering topics (dsa joined in M-DS ruling 6) + 29 data topics. */
const EXPECTED_TOPICS = 59

/** §9.2: "Initially active: E1 and E2 (Engineering), D0 (Data & ML)." */
export const ACTIVE_PHASES = ['E1', 'E2', 'D0']

export function load() {
  const doc = readFileSync('docs/DATA_ML_TRACK.md', 'utf8')
  // Bounded at §9.3 so the scan cannot wander into a later table whose first
  // column happens to look like a phase id.
  return parsePhases(doc, '### 9.2', '### 9.3')
}

export function validate(phases) {
  if (phases.size !== EXPECTED_TOPICS) {
    throw new Error(
      `Parsed ${phases.size} topic→phase assignments, expected ${EXPECTED_TOPICS}. ` +
        `§9.2 changed; every topic in both tracks must have exactly one phase.`,
    )
  }

  const malformed = [...phases.values()].filter((p) => !/^[ED][0-9]{1,2}$/.test(p))
  if (malformed.length > 0) {
    throw new Error(`Malformed phase ids: ${[...new Set(malformed)].join(', ')}`)
  }

  const byPhase = {}
  for (const phase of phases.values()) byPhase[phase] = (byPhase[phase] ?? 0) + 1
  return { topics: phases.size, phases: byPhase }
}

export async function seed(sql, phases, userId) {
  const topics = [...phases.keys()]
  const values = [...phases.values()]

  /*
   * Both statements are set-based rather than a loop over 358 rows: this runs
   * against a database 300ms away, and 358 round trips is two minutes of
   * latency to write data that fits in one statement.
   */
  const assigned = await sql`
    UPDATE skill SET phase = t.phase
    FROM unnest(${topics}::text[], ${values}::text[]) AS t(topic, phase)
    WHERE skill.id = t.topic
    RETURNING skill.id`

  const inherited = await sql`
    UPDATE skill AS leaf SET phase = parent.phase
    FROM skill AS parent
    WHERE leaf.parent_id = parent.id AND parent.phase IS NOT NULL
    RETURNING leaf.id`

  if (userId !== null) {
    await sql`
      INSERT INTO active_phase (user_id, phase)
      SELECT ${userId}, unnest(${ACTIVE_PHASES}::text[])
      ON CONFLICT (user_id, phase) DO NOTHING`
  }

  return { topics: assigned.length, leaves: inherited.length }
}
