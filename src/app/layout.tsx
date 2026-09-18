import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atlas',
  description: 'Personal engineering operating system',
  // Private tool. Never indexed, even if the deployment URL leaks.
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}
