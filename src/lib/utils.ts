/*
 * Joins class names, dropping falsy ones.
 *
 * Deliberately not clsx + tailwind-merge. With four components and no external
 * consumers, two dependencies to resolve utility conflicts is more machinery
 * than the problem warrants. The trade-off: a caller passing a class that
 * conflicts with a component default gets both, and CSS source order decides.
 * Promote to tailwind-merge when that actually bites.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
