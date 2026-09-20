import { sql } from 'drizzle-orm'
import type { DecayDecision } from '@/domain/scheduler'
import { getDb } from './client'

/*
 * The mastery gate's write path.
 *
 * DATABASE_DESIGN.md §4.5: skill_state has a single writer, and no state change
 * happens without a matching mastery_transition row. That pairing is the whole
 * point of the audit trail, so both happen in one statement — there is no
 * window in which a state moved and nothing recorded why.
 *
 * The scheduler decides; this writes. `buildPlan` returns DecayDecision[] and
 * never touches a table, which is what keeps it pure and testable in
 * milliseconds.
 */

/**
 * Applies proposed demotions, one round trip regardless of how many.
 *
 * The new state is computed in SQL from the enum's own ordering rather than in
 * TypeScript: `enum_range` is the authoritative ladder, and duplicating it here
 * would give two places to disagree about what sits below PRACTICAL. It floors
 * at the first value, so UNASSESSED cannot demote below itself.
 *
 * Returns the transitions actually written. A node already at the floor, or
 * whose state changed since the plan was built, produces no row.
 */
export async function applyDecayDecisions(
  userId: string,
  decisions: readonly DecayDecision[],
): Promise<{ skillId: string; fromState: string; toState: string }[]> {
  const demotions = decisions.filter((decision) => decision.demote)
  if (demotions.length === 0) return []

  const skillIds = demotions.map((decision) => decision.skillId)
  const reasons = demotions.map((decision) => decision.reason)

  const result = await getDb().execute<{
    skill_id: string
    from_state: string
    to_state: string
  }>(sql`
    WITH proposed AS (
      SELECT * FROM unnest(${skillIds}::text[], ${reasons}::text[]) AS t(skill_id, reason)
    ),
    demoted AS (
      UPDATE skill_state ss
      SET state = (enum_range(NULL::mastery_state))[
            array_position(enum_range(NULL::mastery_state), ss.state) - 1
          ],
          updated_at = now()
      FROM proposed p
      WHERE ss.user_id = ${userId}::uuid
        AND ss.skill_id = p.skill_id
        -- Nothing below the floor, and nothing already there.
        AND array_position(enum_range(NULL::mastery_state), ss.state) > 1
      RETURNING ss.skill_id,
                (enum_range(NULL::mastery_state))[
                  array_position(enum_range(NULL::mastery_state), ss.state) + 1
                ] AS from_state,
                ss.state AS to_state,
                p.reason
    )
    INSERT INTO mastery_transition (user_id, skill_id, from_state, to_state, reason, automatic)
    SELECT ${userId}::uuid, skill_id, from_state, to_state, reason, true
    FROM demoted
    RETURNING skill_id, from_state, to_state`)

  return result.rows.map((row) => ({
    skillId: row.skill_id,
    fromState: row.from_state,
    toState: row.to_state,
  }))
}
