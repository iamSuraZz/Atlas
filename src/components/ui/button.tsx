import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

/*
 * One accent in the system, so exactly one variant may use it. `primary` is the
 * single affirmative action on a screen; anything else is secondary or ghost.
 * Making that a type rather than a convention is the cheapest enforcement there
 * is (docs/UX_PLAN.md §4).
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-raised text-text border border-border-control hover:bg-surface',
  ghost: 'text-text-2 hover:text-text hover:bg-raised',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-step-0',
  md: 'h-9 px-4 text-step-1',
}

export type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      // Explicit: a bare <button> inside a form defaults to submit, which is
      // almost never what a component caller means.
      type={type}
      className={cn(
        'rounded-ctl inline-flex items-center justify-center gap-2 font-medium',
        // 150ms ease-out, transitions only — no celebratory motion (UX_PLAN §4).
        'transition-colors duration-150 ease-out',
        // Focus ring is never removed (UX_PLAN §6). :focus-visible in globals.css
        // supplies it; this only guarantees it is not clipped.
        'outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
