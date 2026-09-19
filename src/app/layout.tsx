import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/*
 * Self-hosted, not next/font/google. Google Fonts is fetched at build time,
 * which makes every build depend on a third party and fail offline. These two
 * files are committed (Inter 47 KB, JetBrains Mono 40 KB, both variable-weight,
 * latin subset) with their SIL OFL licences alongside, as the licence requires.
 */
const inter = localFont({
  src: './fonts/inter-variable.woff2',
  variable: '--font-ui-loaded',
  display: 'swap',
  weight: '100 900',
})

const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-variable.woff2',
  variable: '--font-mono-loaded',
  display: 'swap',
  weight: '100 800',
})

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
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  )
}
