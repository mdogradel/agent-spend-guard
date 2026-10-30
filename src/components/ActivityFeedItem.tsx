import Link from 'next/link'
import { agentLabel } from '@/lib/agents'
import { formatUSD, formatWhen } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import type { IntentReceipt } from '@/types'

export function MismatchMark() {
  return (
    <span data-testid="mismatch-dot" className="inline-flex items-center gap-1 text-xs font-medium text-orange-800">
      <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />
      Intent mismatch
    </span>
  )
}

export function ActivityFeedItem({ receipt }: { receipt: IntentReceipt }) {
  const purchase = receipt.purchaseRequest
  const amount = receipt.usdEquivalentAmount ?? purchase.amount
  const mismatched = receipt.mismatches.length > 0

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      data-testid="activity-item"
      className="flex items-center justify-between gap-3 border-b border-stone-100 py-3 text-sm last:border-b-0 hover:bg-stone-50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-stone-900">{purchase.merchantName}</p>
        <p className="text-stone-500">
          {agentLabel(purchase.agentName)} · {purchase.category} · {formatWhen(purchase.submittedAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {mismatched ? <MismatchMark /> : null}
        <span className="tabular-nums text-stone-800">{formatUSD(amount)}</span>
        <StatusBadge status={receipt.status} />
      </div>
    </Link>
  )
}
