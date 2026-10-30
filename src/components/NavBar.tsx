'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/rules', label: 'Rules' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/receipts', label: 'Receipts' },
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
