/**
 * Result type for the domain layer.
 *
 * The domain layer never throws for expected failures and never imports a
 * framework, a database client, or an AI SDK — see eslint.config.mjs.
 * That constraint is what keeps the scheduler and mastery engine testable
 * in milliseconds without a database.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok

/** Unwrap, or throw. Use at the infrastructure boundary only, never inside domain logic. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw new Error(`unwrap() on Err: ${JSON.stringify(r.error)}`)
}

export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r
}

export function flatMap<T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? f(r.value) : r
}
