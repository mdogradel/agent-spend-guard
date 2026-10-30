import Link from 'next/link'
import { formatUSD } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import type { IntentReceipt } from '@/types'

export function ActivityFeedItem({ receipt }: { receipt: IntentReceipt }) {
  const amount = receipt.usdEquivalentAmount ?? receipt.purchaseRequest.amount
  const mismatched = receipt.mismatches.length > 0

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      data-testid="activity-item"
      className="flex items-center justify-between gap-3 border-b border-stone-100 py-3 text-sm last:border-b-0 hover:bg-stone-50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-stone-900">{receipt.purchaseRequest.merchantName}</p>
        <p className="text-stone-500">{receipt.purchaseRequest.category}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {mismatched ? (
          <span
            data-testid="mismatch-dot"
            title="Intent mismatch"
            className="h-2 w-2 rounded-full bg-orange-500"
          />
        ) : null}
        <span className="tabular-nums text-stone-800">{formatUSD(amount)}</span>
        <StatusBadge status={receipt.status} />
      </div>
    </Link>
  )
}
