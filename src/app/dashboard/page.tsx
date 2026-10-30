'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ActivityFeedItem } from '@/components/ActivityFeedItem'
import { SpendProgressBar } from '@/components/SpendProgressBar'
import { formatUSD } from '@/lib/format'
import { getMonthKey } from '@/lib/monthly-reset'
import { spendFor } from '@/lib/rules-engine'
import { computeCommittedSpend, useSpendGuardStore } from '@/store/useSpendGuardStore'

export default function DashboardPage() {
  const rules = useSpendGuardStore((state) => state.rules)
  const receipts = useSpendGuardStore((state) => state.receipts)
  // committedSpend() builds a new object on every call. Selecting it with
  // Zustand makes useSyncExternalStore think the snapshot changed forever.
  const month = getMonthKey(new Date())
  const committed = useMemo(
    () => computeCommittedSpend(receipts, month),
    [receipts, month],
  )

  const categorySpend = rules.categoryLimits.reduce(
    (sum, limit) => sum + spendFor(committed.byCategory, limit.category),
    0,
  )
  const categoryLimit = rules.categoryLimits.reduce((sum, limit) => sum + limit.limitAmountUSD, 0)
  const merchantSpend = rules.merchantLimits.reduce(
    (sum, limit) => sum + spendFor(committed.byMerchant, limit.merchant),
    0,
  )
  const merchantLimit = rules.merchantLimits.reduce((sum, limit) => sum + limit.limitAmountUSD, 0)
  const recent = receipts.slice(0, 20)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">
          Committed spend includes approved purchases and anything still waiting in the inbox.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Summary
          label="Categories"
          spend={categorySpend}
          limit={categoryLimit}
          empty={rules.categoryLimits.length === 0}
        />
        <Summary
          label="Merchants"
          spend={merchantSpend}
          limit={merchantLimit}
          empty={rules.merchantLimits.length === 0}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Limits</h2>
        {rules.categoryLimits.length === 0 && rules.merchantLimits.length === 0 ? (
          <p className="text-sm text-stone-600">
            No limits yet. <Link href="/rules" className="font-medium text-teal-800">Add rules</Link> to see spend against them.
          </p>
        ) : (
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
            {rules.categoryLimits.map((limit) => (
              <SpendProgressBar
                key={limit.id}
                label={limit.category}
                committed={spendFor(committed.byCategory, limit.category)}
                limit={limit.limitAmountUSD}
              />
            ))}
            {rules.merchantLimits.map((limit) => (
              <SpendProgressBar
                key={limit.id}
                label={limit.merchant}
                committed={spendFor(committed.byMerchant, limit.merchant)}
                limit={limit.limitAmountUSD}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            No purchases yet. Try a preset in the <Link href="/simulator" className="font-medium text-teal-800">simulator</Link>.
          </p>
        ) : (
          <div className="mt-2 rounded-xl border border-stone-200 bg-white px-4">
            {recent.map((receipt) => (
              <ActivityFeedItem key={receipt.id} receipt={receipt} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Summary({
  label,
  spend,
  limit,
  empty,
}: {
  label: string
  spend: number
  limit: number
  empty: boolean
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      {empty ? (
        <p className="mt-2 text-sm text-stone-600">No {label.toLowerCase()} configured.</p>
      ) : (
        <p className="mt-2 text-lg font-semibold text-stone-900">
          {formatUSD(spend)} <span className="text-sm font-normal text-stone-500">of {formatUSD(limit)}</span>
        </p>
      )}
    </div>
  )
}
