import { redirect } from 'next/navigation'

// UX_PLAN §2: the app opens on TODAY. There is no aggregate dashboard by design.
export default function RootPage() {
  redirect('/today')
}
