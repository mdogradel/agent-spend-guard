'use client'

import { formatMoney, formatUSD } from '@/lib/format'
import type { IntentReceipt } from '@/types'

interface PurchaseCardProps {
  receipt: IntentReceipt
  onApprove: () => void
  onDecline: () => void
}

export function PurchaseCard({ receipt, onApprove, onDecline }: PurchaseCardProps) {
  const purchase = receipt.purchaseRequest
  const foreign = purchase.currency.trim().toUpperCase() !== 'USD'
  const intent = purchase.intentText?.trim() || 'No instruction provided'

  return (
    <article data-testid="purchase-card" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">{purchase.agentName}</p>
          <h2 className="text-lg font-semibold text-stone-900">{purchase.merchantName}</h2>
          <p className="text-sm text-stone-600">{purchase.category}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-stone-900">
            {receipt.usdEquivalentAmount == null ? 'USD unavailable' : formatUSD(receipt.usdEquivalentAmount)}
          </p>
          {foreign ? (
            <p className="text-xs text-stone-500">
              {formatMoney(purchase.amount, purchase.currency)}
              {receipt.fxRate
                ? ` · 1 ${receipt.fxRate.fromCurrency} = ${receipt.fxRate.rate.toFixed(6)} USD`
                : ''}
              {receipt.fxRate?.isStale ? ' · rate may be stale' : ''}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm text-stone-700">
        <span className="font-medium text-stone-900">Intent: </span>
        {intent}
      </p>
      <p className="mt-1 text-sm text-stone-700">
        <span className="font-medium text-stone-900">Reason: </span>
        {receipt.decision.explanation || 'No rule failed.'}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Decline
        </button>
      </div>
    </article>
  )
}
