'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { NavBar } from '@/components/NavBar'
import { StorageWarningBanner } from '@/components/StorageWarningBanner'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

export function AppShell({ children }: { children: ReactNode }) {
  const hydrate = useSpendGuardStore((state) => state.hydrate)
  const runMonthlyResetIfNeeded = useSpendGuardStore((state) => state.runMonthlyResetIfNeeded)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    hydrate()
    runMonthlyResetIfNeeded()
    setReady(true)
  }, [hydrate, runMonthlyResetIfNeeded])

  if (!ready) {
    return <p className="px-4 py-8 text-sm text-stone-500">Loading your spend guard…</p>
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StorageWarningBanner />
      <NavBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}
