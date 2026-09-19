import { cn } from '@/lib/utils'

export type CardProps = React.ComponentPropsWithoutRef<'div'>

/*
 * A surface, not a component with opinions. Padding is the caller's business —
 * the density varies too much between a metric tile and a mission body for a
 * single default to be right.
 */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-card border-border bg-surface border', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn('flex flex-col gap-1 p-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<'h3'>) {
  return <h3 className={cn('text-step-2 text-text font-medium', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('text-step-0 text-text-2', className)} {...props} />
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn('p-4 pt-0', className)} {...props} />
}
