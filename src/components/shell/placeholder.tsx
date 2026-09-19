/*
 * Every shell route renders one of these until its milestone lands. Naming the
 * milestone is the point: a blank screen reads as broken, and inventing sample
 * content would be the fake data rule 3 forbids.
 */
export function Placeholder({
  title,
  milestone,
  what,
}: {
  title: string
  milestone: string
  what: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-step-3 font-medium">{title}</h1>
      <p className="text-step-1 text-text-2 max-w-prose">{what}</p>
      <p className="text-step-0 text-text-3 font-mono tracking-widest uppercase">
        Not built yet · {milestone}
      </p>
    </section>
  )
}
