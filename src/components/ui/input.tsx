import { cn } from '@/lib/utils'

export type InputProps = React.ComponentPropsWithoutRef<'input'>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'rounded-ctl text-step-1 h-9 w-full px-3',
        'bg-surface text-text placeholder:text-text-3',
        /*
         * border-control, not border. The edge is the only thing identifying
         * this as an input, so WCAG 2.2 SC 1.4.11 requires 3:1 against the
         * surface behind it — see the comment in src/styles/tokens.css.
         */
        'border-border-control border',
        'transition-colors duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-fail',
        className,
      )}
      {...props}
    />
  )
}
