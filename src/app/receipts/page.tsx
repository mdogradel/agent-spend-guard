'use client'

import Link from 'next/link'
import { MismatchMark } from '@/components/ActivityFeedItem'
import { StatusBadge } from '@/components/StatusBadge'
import { agentLabel } from '@/lib/agents'
import { formatMoney, formatUSD, formatWhen } from '@/lib/format'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

export default function ReceiptsPage() {
  const receipts = useSpendGuardStore((state) => state.receipts)

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Receipts</h1>
        <p className="mt-1 text-sm text-stone-600">What each agent bought, and when</p>
      </header>

      {receipts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
          No receipts yet.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {receipts.map((receipt) => {
            const purchase = receipt.purchaseRequest
            const foreign = purchase.currency.trim().toUpperCase() !== 'USD'
            return (
              <li key={receipt.id}>
                <Link
                  href={`/receipts/${receipt.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{purchase.merchantName}</p>
                    <p className="text-stone-500">
                      {agentLabel(purchase.agentName)} · {purchase.category} · {formatWhen(purchase.submittedAt)}
                      {foreign ? ` · ${formatMoney(purchase.amount, purchase.currency)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {receipt.mismatches.length > 0 ? <MismatchMark /> : null}
                    <span className="tabular-nums">
                      {receipt.usdEquivalentAmount == null
                        ? 'USD unavailable'
                        : formatUSD(receipt.usdEquivalentAmount)}
                    </span>
                    <StatusBadge status={receipt.status} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
