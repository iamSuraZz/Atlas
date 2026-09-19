import { PasskeyRegistration } from '@/components/passkey-registration'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-medium">Atlas</h1>
      <p className="text-sm leading-relaxed text-[var(--text-3)]">
        Foundation only. No skill graph, no scheduler, no AI — those are M1 to M3. See{' '}
        <code className="font-mono">docs/M0_SPEC.md</code>.
      </p>
      <PasskeyRegistration />
    </main>
  )
}
