'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ActivityFeedItem } from '@/components/ActivityFeedItem'
import { SpendProgressBar } from '@/components/SpendProgressBar'
import { summarizeByAgent } from '@/lib/agents'
import { formatUSD, formatWhen } from '@/lib/format'
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
  const byAgent = useMemo(() => summarizeByAgent(receipts), [receipts])

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Agent Spend Guard</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-stone-900">
          Every AI agent that spends your money, in one place
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
          Your agents follow your rules and your intent. Anything over a limit waits for your OK.
          Every purchase shows which agent bought what, and when.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ValueTile title="Connect your agents" detail="See every agent that spends on your behalf, in this one place." />
          <ValueTile title="Enforce your rules and intent" detail="Limits, blocked categories, and what you asked for, checked on each purchase." />
          <ValueTile title="Approve overages and audit every purchase" detail="Anything over a limit waits for you. Each receipt says who bought what, and when." />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/rules"
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900"
          >
            Try it in 30 seconds
          </Link>
          <Link
            href="/simulator"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Run a simulated agent purchase
          </Link>
          <p className="text-sm text-stone-500">Load sample rules, then run a simulated agent purchase.</p>
        </div>
      </section>

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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">By agent</h2>
        {byAgent.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            No agents yet. Load sample rules, then run a simulated purchase.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {byAgent.map((agent) => (
              <li key={agent.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-stone-900">{agent.name}</p>
                  <p className="text-stone-500">
                    {agent.count} purchase{agent.count === 1 ? '' : 's'} · last {formatWhen(agent.lastAt)}
                  </p>
                </div>
                <p className="tabular-nums font-medium text-stone-800">{formatUSD(agent.totalUsd)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Recent purchases</h2>
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

function ValueTile({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-stone-600">{detail}</p>
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
