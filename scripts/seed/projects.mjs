/*
 * The §6 project ladder — fifteen projects, small to big.
 *
 * Two parses over the same section: the table gives the structured fields, the
 * "Project briefs" paragraphs give the prose. A project with a table row and no
 * brief (or the reverse) stops the seed, because half a project is how a
 * ladder quietly grows a missing rung.
 *
 * Hours stay a min/max pair. §6 gives ranges — "6–8", "40–60" — and collapsing
 * one to its midpoint would persist a number the document does not state.
 *
 * On `build_project_skill`: §6 tags each project with a PHASE, never with
 * skills, so the links are derived exactly as `resource_skill` is.
 */
import { readFileSync } from 'node:fs'

const EXPECTED_PROJECTS = 15

/*
 * P15 is the capstone and D9 has no topics (§9.2 assigns none), so the phase
 * derivation gave it zero skill links — the largest project on the ladder
 * attached to nothing. M-DS ruling 8: it inherits the union of the projects it
 * is actually built from, plus the two engineering nodes it adds.
 *
 * Expressed as the union of P9, P12, P13 and P14's OWN links rather than as a
 * hard-coded topic list, so it stays correct if a phase gains or loses topics.
 */
const CAPSTONE = {
  id: 'P15',
  inherits: ['P9', 'P12', 'P13', 'P14'],
  // C-MAPSS replayed as a live stream on Redis Streams, with a realtime dashboard.
  adds: ['redis/streams', 'realtime'],
}

const LEVELS = new Set([
  'Beginner',
  'Beginner+',
  'Intermediate',
  'Intermediate+',
  'Advanced',
  'Hero',
])

const strip = (s) => s.replace(/\*\*/g, '').trim()

/** "6–8" -> [6, 8]; "20" -> [20, 20]. En-dash and hyphen both appear in §6. */
function parseHours(cell) {
  const range = cell.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/)
  if (range) return [Number(range[1]), Number(range[2])]

  const single = cell.trim().match(/^(\d+)$/)
  if (single) return [Number(single[1]), Number(single[1])]

  throw new Error(`unparseable hours cell: ${JSON.stringify(cell)}`)
}

export function load() {
  const doc = readFileSync('docs/DATA_ML_TRACK.md', 'utf8')
  const section = doc.split('## 6. The project ladder')[1].split('\n## ')[0]
  const [tablePart, briefPart] = section.split('### Project briefs')

  if (briefPart === undefined) throw new Error('§6 has no "Project briefs" subsection.')

  const projects = []
  let sequence = 0

  for (const line of tablePart.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (!/^P\d+$/.test(cells[0])) continue

    if (cells.length !== 7) {
      throw new Error(`§6 row ${cells[0]}: expected 7 cells, got ${cells.length}`)
    }

    const [id, name, level, phase, dataSource, proves, hours] = cells
    const [estHoursMin, estHoursMax] = parseHours(hours)

    projects.push({
      id,
      sequence: ++sequence,
      name: strip(name),
      level: strip(level),
      phase: strip(phase),
      dataSource: strip(dataSource),
      proves: strip(proves),
      estHoursMin,
      estHoursMax,
      brief: findBrief(briefPart, id),
    })
  }

  return projects
}

/**
 * The brief for one project: the paragraph beginning `**P1 — …**`, up to the
 * blank line. Returns null when absent, which validate() rejects — a silent
 * empty string would seed a project nobody can read.
 */
function findBrief(briefPart, id) {
  const start = briefPart.indexOf(`**${id} —`)
  if (start === -1) return null

  const paragraph = briefPart.slice(start).split('\n\n')[0]
  // Drop the "**P1 — Title.**" lead-in; the title is already a column.
  return strip(paragraph.replace(/^\*\*[^*]*\*\*\s*/, '')).replace(/\s+/g, ' ')
}

export function validate(projects) {
  if (projects.length !== EXPECTED_PROJECTS) {
    throw new Error(
      `Parsed ${projects.length} projects, expected ${EXPECTED_PROJECTS}. ` +
        `§6 changed; update the constant deliberately.`,
    )
  }

  const missing = projects.filter((p) => p.brief === null || p.brief === '')
  if (missing.length > 0) {
    throw new Error(`No brief for: ${missing.map((p) => p.id).join(', ')}`)
  }

  const badLevel = projects.filter((p) => !LEVELS.has(p.level))
  if (badLevel.length > 0) {
    throw new Error(
      `Unknown level: ${badLevel.map((p) => `${p.id}=${p.level}`).join(', ')}`,
    )
  }

  const badPhase = projects.filter((p) => !/^[ED]\d{1,2}$/.test(p.phase))
  if (badPhase.length > 0) {
    throw new Error(
      `Malformed phase: ${badPhase.map((p) => `${p.id}=${p.phase}`).join(', ')}`,
    )
  }

  const ids = new Set(projects.map((p) => p.id))
  if (ids.size !== projects.length) throw new Error('§6 contains duplicate project ids.')

  const byPhase = {}
  for (const p of projects) byPhase[p.phase] = (byPhase[p.phase] ?? 0) + 1
  const hours = projects.reduce((n, p) => n + p.estHoursMax, 0)
  return { total: projects.length, byPhase, maxHours: hours }
}

export async function seed(sql, projects) {
  for (const p of projects) {
    await sql`
      INSERT INTO build_project (id, sequence, name, level, phase, data_source,
                                 proves, est_hours_min, est_hours_max, brief)
      VALUES (${p.id}, ${p.sequence}, ${p.name}, ${p.level}, ${p.phase},
              ${p.dataSource}, ${p.proves}, ${p.estHoursMin}, ${p.estHoursMax},
              ${p.brief})
      ON CONFLICT (id) DO UPDATE SET
        sequence = EXCLUDED.sequence, name = EXCLUDED.name, level = EXCLUDED.level,
        phase = EXCLUDED.phase, data_source = EXCLUDED.data_source,
        proves = EXCLUDED.proves, est_hours_min = EXCLUDED.est_hours_min,
        est_hours_max = EXCLUDED.est_hours_max, brief = EXCLUDED.brief`
  }

  // Derived, and rebuilt rather than merged — see resources.mjs.
  await sql`DELETE FROM build_project_skill`
  const linked = await sql`
    INSERT INTO build_project_skill (project_id, skill_id)
    SELECT p.id, s.id
    FROM build_project p
    JOIN skill s ON s.phase = p.phase AND s.parent_id IS NULL
    ON CONFLICT DO NOTHING
    RETURNING project_id`

  // The capstone, after the derivation it is not covered by.
  const inherited = await sql`
    INSERT INTO build_project_skill (project_id, skill_id)
    SELECT ${CAPSTONE.id}, skill_id FROM build_project_skill
    WHERE project_id = ANY(${CAPSTONE.inherits}::text[])
    ON CONFLICT DO NOTHING
    RETURNING skill_id`

  const added = await sql`
    INSERT INTO build_project_skill (project_id, skill_id)
    SELECT ${CAPSTONE.id}, unnest(${CAPSTONE.adds}::text[])
    ON CONFLICT DO NOTHING
    RETURNING skill_id`

  return {
    projects: projects.length,
    links: linked.length + inherited.length + added.length,
    capstone: inherited.length + added.length,
  }
}
