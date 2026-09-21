import { and, eq } from 'drizzle-orm'
import { getDb } from './client'
import { evidence, evidenceSkill } from './schema'

/*
 * Repository access to the evidence ledger.
 *
 * DECISIONS.md §6.1: `raw_body` never leaves the database. That is enforced
 * here by construction rather than by discipline — `EvidenceRecord` omits the
 * field, every query below lists its columns explicitly, and there is no
 * exported function that returns the row type. A context builder that tries to
 * read `raw_body` does not leak; it fails to compile.
 *
 * The selection is written out column by column on purpose. `select()` with no
 * argument returns every column, so a future column added to the table would
 * silently join the payload — including the next sensitive one.
 */

const SHAREABLE_COLUMNS = {
  id: evidence.id,
  userId: evidence.userId,
  kind: evidence.kind,
  title: evidence.title,
  occurredOn: evidence.occurredOn,
  classification: evidence.classification,
  shareableBody: evidence.shareableBody,
  aiAllowed: evidence.aiAllowed,
  publishAllowed: evidence.publishAllowed,
  approvedAt: evidence.approvedAt,
  metricValue: evidence.metricValue,
  metricUnit: evidence.metricUnit,
  metricSource: evidence.metricSource,
  artifactUrl: evidence.artifactUrl,
  verified: evidence.verified,
  createdAt: evidence.createdAt,
} as const

/** An evidence row as anything outside this module is allowed to see it. */
export type EvidenceRecord = {
  [K in keyof typeof SHAREABLE_COLUMNS]: (typeof evidence.$inferSelect)[K]
}

export async function listEvidence(userId: string): Promise<EvidenceRecord[]> {
  return getDb()
    .select(SHAREABLE_COLUMNS)
    .from(evidence)
    .where(eq(evidence.userId, userId))
}

/**
 * Rows a model is permitted to see: approved for AI, and therefore carrying a
 * hand-written shareable body (the `ai_needs_shareable` constraint guarantees
 * the second follows from the first).
 */
export async function listAiAllowedEvidence(userId: string): Promise<EvidenceRecord[]> {
  return getDb()
    .select(SHAREABLE_COLUMNS)
    .from(evidence)
    .where(eq(evidence.userId, userId))
    .then((rows) => rows.filter((row) => row.aiAllowed))
}

/**
 * The evidence chain behind one skill: every item linked to it, with the flag
 * that says whether it counted as an objective artifact. Returns the same
 * raw_body-free shape as everything else in this module.
 */
export async function listEvidenceForSkill(
  userId: string,
  skillId: string,
): Promise<(EvidenceRecord & { objective: boolean })[]> {
  return getDb()
    .select({ ...SHAREABLE_COLUMNS, objective: evidenceSkill.objective })
    .from(evidence)
    .innerJoin(evidenceSkill, eq(evidenceSkill.evidenceId, evidence.id))
    .where(and(eq(evidence.userId, userId), eq(evidenceSkill.skillId, skillId)))
}

/*
 * ─── Write path (M-DS task c) ────────────────────────────────────────────
 *
 * The only function in this module that inserts. It takes a draft built by
 * src/domain/runner/formats.ts, so what goes into the ledger is decided by a
 * pure, tested function rather than assembled at a call site.
 *
 * Nothing here sets `ai_allowed`, `publish_allowed` or `approved_at`. Those
 * are separate, explicit acts (DECISIONS.md §6.1), and a runner that granted
 * them would make submitting a notebook a silent approval of its contents.
 */

export type NewEvidence = {
  readonly userId: string
  readonly skillId: string
  readonly kind: 'CODE_ARTIFACT'
  /** Default-deny. The runner writes PRIVATE; promotion is a separate act. */
  readonly classification: 'PRIVATE'
  readonly title: string
  readonly occurredOn: string
  readonly rawBody: string
  readonly metricValue: number | null
  readonly metricUnit: string | null
  readonly metricSource: string | null
  readonly artifactUrl: string
  /** Whether this counts toward the PRACTICAL gate. */
  readonly objective: boolean
}

export async function recordEvidence(row: NewEvidence): Promise<string> {
  const db = getDb()

  const [created] = await db
    .insert(evidence)
    .values({
      userId: row.userId,
      kind: row.kind,
      classification: row.classification,
      title: row.title,
      occurredOn: row.occurredOn,
      rawBody: row.rawBody,
      // numeric arrives and departs as a string; see mappers.ts.
      metricValue: row.metricValue === null ? null : String(row.metricValue),
      metricUnit: row.metricUnit,
      metricSource: row.metricSource,
      artifactUrl: row.artifactUrl,
    })
    .returning({ id: evidence.id })

  if (!created) throw new Error('evidence insert returned no row')

  await db
    .insert(evidenceSkill)
    .values({ evidenceId: created.id, skillId: row.skillId, objective: row.objective })

  return created.id
}
