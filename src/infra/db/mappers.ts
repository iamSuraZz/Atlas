import type { AppUser } from './schema'

/*
 * Postgres `numeric` is an arbitrary-precision decimal. The driver returns it
 * as a string because no JavaScript number can represent every value it can
 * hold, and silently rounding at the driver layer would lose data with no
 * error. Conversion therefore happens here, explicitly, at the boundary where
 * a database row becomes something the domain layer can use.
 *
 * Two approaches were rejected. A global type parser changes how every numeric
 * column in the application behaves from one line of setup, invisibly from the
 * call site. `.$type<number>()` is worse: it tells the compiler the value is a
 * number while the driver still hands over a string, so the lie only surfaces
 * at runtime.
 */

/**
 * Precision note: correct only for columns narrow enough to fit a double
 * (~15 significant digits). `app_user.weekly_hours` is numeric(4,1), so it fits
 * with room to spare. A wider column must stay a string or become a bigint —
 * see docs/DATABASE_DESIGN.md §2.1.
 */
export function numericToNumber(value: string, column: string): number {
  // Number('') is 0, so an empty string would otherwise become a silent zero.
  if (value.trim() === '') {
    throw new Error(`Expected a numeric value for ${column}, got an empty string.`)
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Expected a numeric value for ${column}, got ${JSON.stringify(value)}.`,
    )
  }

  return parsed
}

/** An `app_user` row with its numeric columns converted for domain use. */
export type AppUserRecord = Omit<AppUser, 'weeklyHours'> & { weeklyHours: number }

/*
 * The shape returned here is defined in infra only because the domain has no
 * user type yet. When M1 introduces one, this function becomes the single place
 * that produces it, and the type moves to src/domain/.
 */
export function toAppUserRecord(row: AppUser): AppUserRecord {
  return {
    ...row,
    weeklyHours: numericToNumber(row.weeklyHours, 'app_user.weekly_hours'),
  }
}
