'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/*
 * Four items in M0. UX_PLAN §2 specifies six — INTERVIEW and JOURNAL are unbuilt,
 * not removed; see the dated note in that section.
 */
const ITEMS = [
  { href: '/today', label: 'TODAY' },
  { href: '/skills', label: 'SKILLS' },
  { href: '/projects', label: 'PROJECTS' },
  { href: '/career', label: 'CAREER' },
] as const

export function Nav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="border-border border-b">
      <ul className="mx-auto flex max-w-5xl gap-1 px-6">
        {ITEMS.map((item) => {
          const active = pathname === item.href

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                // The accent is reserved for the primary action, so the active
                // item is marked by weight and a rule, not by colour.
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-step-0 inline-block border-b-2 px-3 py-3 font-mono tracking-widest transition-colors duration-150 ease-out',
                  active
                    ? 'border-text text-text'
                    : 'text-text-3 hover:text-text-2 border-transparent',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
