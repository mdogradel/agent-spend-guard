'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', subtitle: 'Every agent that spends your money' },
  { href: '/inbox', label: 'Inbox', subtitle: 'Purchases waiting for your approval' },
  { href: '/rules', label: 'Rules', subtitle: 'Your rules and limits' },
  { href: '/simulator', label: 'Simulator', subtitle: 'Simulate an agent purchase' },
  { href: '/receipts', label: 'Receipts', subtitle: 'What each agent bought, and when' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PendingBadge() {
  const pending = useSpendGuardStore((state) => state.pendingCount())
  return (
    <span
      data-testid="pending-badge"
      className={`ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
        pending > 0 ? 'bg-amber-500 text-amber-950' : 'bg-stone-200 text-stone-600'
      }`}
    >
      {pending}
    </span>
  )
}

export function NavBar() {
  const pathname = usePathname()

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-teal-900">
          Agent Spend Guard
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.subtitle}
                data-testid={link.href === '/inbox' ? 'nav-inbox' : undefined}
                className={`rounded-full px-3 py-1.5 ${
                  active ? 'bg-teal-800 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                {link.label}
                {link.href === '/inbox' ? <PendingBadge /> : null}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
