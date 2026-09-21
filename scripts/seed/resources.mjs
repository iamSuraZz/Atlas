/*
 * The §8 resource library — what to actually go and learn from.
 *
 * §8 comes in two shapes: four markdown tables and three prose lists separated
 * by "·". Both are parsed here, and each section states its own expected count,
 * so a resource quietly added or dropped stops the seed rather than sliding in.
 *
 * On `free`: §8 ticks Watch, Play and Courses; titles the next two sections
 * "free online" and "books worth buying"; and says nothing either way about
 * Practise and Tools. Those last two are seeded NULL. A default of `true`
 * would turn the document's silence into a claim it never made.
 *
 * On `resource_skill`: §8 tags resources with PHASES, never with skills. The
 * links are therefore derived — every topic in the tagged phase (§9.2) — and
 * regenerated on every run rather than curated. The phase list is kept on the
 * resource row so the derivation stays checkable without re-reading §8.
 */
import { readFileSync } from 'node:fs'

const SECTIONS = [
  { heading: '### Watch (visual)', kind: 'WATCH', columns: 4, expect: 6 },
  { heading: '### Play (interactive)', kind: 'PLAY', columns: 4, expect: 8 },
  { heading: '### Courses', kind: 'COURSE', columns: 4, expect: 9 },
  // Three columns: no Free cell, because the heading already says it.
  {
    heading: '### Read — free online',
    kind: 'READ_FREE',
    columns: 3,
    expect: 9,
    free: true,
  },
  {
    heading: '### Read — books worth buying',
    kind: 'READ_BOOK',
    prose: true,
    expect: 10,
    free: false,
  },
  { heading: '### Practise', kind: 'PRACTISE', prose: true, expect: 5, free: null },
  { heading: "### Tools you'll use", kind: 'TOOL', prose: true, expect: 7, free: null },
]

/*
 * Resources that do not come from §8, with the skills they attach to named
 * rather than derived. §8 is the Data & ML library; the NeetCode roadmap is an
 * engineering resource, added by M-DS ruling 7, and it belongs to the `dsa`
 * topic specifically — not to every topic that happens to share phase E1.
 */
const CURATED = [
  {
    id: 'neetcode-roadmap',
    kind: 'PLAY',
    title: 'NeetCode roadmap',
    url: 'https://neetcode.io/roadmap',
    free: true,
    note: 'The order the dsa prerequisite edges follow.',
    phases: [],
    skills: ['dsa'],
  },
]

const EXPECTED_TOTAL = SECTIONS.reduce((n, s) => n + s.expect, 0) + CURATED.length

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** "D0–D4" expands; "D5, D8" splits; "After hero" yields nothing. */
function parsePhaseCell(cell) {
  const phases = []
  for (const part of cell.split(',').map((s) => s.trim())) {
    const range = part.match(/^([ED])(\d+)[–-]([ED])(\d+)$/)
    if (range && range[1] === range[3]) {
      for (let i = Number(range[2]); i <= Number(range[4]); i++)
        phases.push(`${range[1]}${i}`)
      continue
    }
    if (/^[ED]\d{1,2}$/.test(part)) phases.push(part)
  }
  return phases
}

/** The text between a heading and whatever ends it. */
function region(doc, heading) {
  const after = doc.split(heading)[1]
  if (after === undefined) throw new Error(`§8 section not found: ${heading}`)
  return after.split(/\n###? |\n---/)[0]
}

function parseTable(body, section) {
  const rows = []
  for (const line of body.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    // Header and separator rows.
    if (cells[0] === 'Resource' || cells[0].startsWith('---')) continue
    if (cells.length !== section.columns) {
      throw new Error(
        `${section.heading}: expected ${section.columns} cells, got ${cells.length} in ${line}`,
      )
    }

    // Book titles are italicised in §8's tables. The emphasis is markup, not
    // part of the name — parseProse already stripped it and this did not.
    const [rawTitle, phaseCell] = cells
    const title = rawTitle.replace(/\*/g, '').trim()
    const link = cells[section.columns - 1]
    const freeCell = section.columns === 4 ? cells[2] : null

    rows.push({
      id: slug(title),
      kind: section.kind,
      title,
      url: link.startsWith('http') ? link : null,
      // A tick is free; anything else is the document's own caveat, kept
      // verbatim rather than interpreted into a boolean.
      free: freeCell === null ? section.free : freeCell === '✅',
      note: freeCell !== null && freeCell !== '✅' ? freeCell : phaseNote(phaseCell),
      phases: parsePhaseCell(phaseCell),
    })
  }
  return rows
}

/** Keeps a phase the column states but the schema cannot hold, e.g. "After hero". */
const phaseNote = (cell) => (parsePhaseCell(cell).length === 0 ? cell : null)

function parseProse(body, section) {
  const text = body
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('|'))
    .join(' ')

  return text
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const url = item.match(/https?:\/\/[^\s)]+/)?.[0] ?? null
      // Strip the trailing parenthetical — it holds either the URL or, for a
      // book, its authors — and the markdown emphasis around a title.
      const parenthetical = item.match(/\(([^)]*)\)\s*$/)?.[1] ?? null
      const title = item
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\*/g, '')
        .trim()

      return {
        id: slug(title),
        kind: section.kind,
        title,
        url,
        free: section.free,
        note: parenthetical !== null && parenthetical !== url ? parenthetical : null,
        phases: [],
      }
    })
}

export function load() {
  const doc = readFileSync('docs/DATA_ML_TRACK.md', 'utf8')
  const parsed = SECTIONS.flatMap((section) => {
    const body = region(doc, section.heading)
    return section.prose ? parseProse(body, section) : parseTable(body, section)
  })
  return [...parsed, ...CURATED.map((r) => ({ ...r }))]
}

export function validate(resources) {
  const counts = {}
  for (const r of resources) counts[r.kind] = (counts[r.kind] ?? 0) + 1

  // The curated rows are counted separately so a §8 drift is still caught
  // exactly, rather than being masked by an extra we added ourselves.
  const curatedIds = new Set(CURATED.map((r) => r.id))
  for (const r of resources) {
    if (curatedIds.has(r.id)) counts[r.kind] = (counts[r.kind] ?? 0) - 1
  }

  for (const section of SECTIONS) {
    const got = counts[section.kind] ?? 0
    if (got !== section.expect) {
      throw new Error(
        `${section.heading}: parsed ${got} resources, expected ${section.expect}. ` +
          `§8 changed; update the constant deliberately.`,
      )
    }
  }

  if (resources.length !== EXPECTED_TOTAL) {
    throw new Error(`Parsed ${resources.length} resources, expected ${EXPECTED_TOTAL}.`)
  }

  const ids = new Set(resources.map((r) => r.id))
  if (ids.size !== resources.length) {
    const seen = new Set()
    const dupes = resources
      .map((r) => r.id)
      .filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
    throw new Error(`Duplicate resource ids: ${[...new Set(dupes)].join(', ')}`)
  }

  const untitled = resources.filter((r) => r.title === '')
  if (untitled.length > 0)
    throw new Error(`${untitled.length} resources parsed with an empty title.`)

  return { total: resources.length, byKind: counts }
}

export async function seed(sql, resources) {
  for (const r of resources) {
    await sql`
      INSERT INTO resource (id, kind, title, url, free, phases, note)
      VALUES (${r.id}, ${r.kind}, ${r.title}, ${r.url}, ${r.free},
              ${r.phases}::text[], ${r.note})
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, title = EXCLUDED.title, url = EXCLUDED.url,
        free = EXCLUDED.free, phases = EXCLUDED.phases, note = EXCLUDED.note`
  }

  /*
   * Derived links, rebuilt from scratch: a resource whose phases changed must
   * lose its old rows, and a DELETE-then-INSERT is honest about that. Both
   * statements are set-based — the join happens in the database, so the
   * derivation is one round trip rather than one per resource.
   */
  await sql`DELETE FROM resource_skill`
  const linked = await sql`
    INSERT INTO resource_skill (resource_id, skill_id)
    SELECT r.id, s.id
    FROM resource r
    JOIN skill s ON s.phase = ANY(r.phases) AND s.parent_id IS NULL
    ON CONFLICT DO NOTHING
    RETURNING resource_id`

  // Curated links are named, not derived, so they are inserted separately.
  const curated = []
  for (const r of CURATED) {
    for (const skillId of r.skills) {
      curated.push(
        ...(await sql`
          INSERT INTO resource_skill (resource_id, skill_id)
          VALUES (${r.id}, ${skillId})
          ON CONFLICT DO NOTHING
          RETURNING resource_id`),
      )
    }
  }

  return { resources: resources.length, links: linked.length + curated.length }
}
