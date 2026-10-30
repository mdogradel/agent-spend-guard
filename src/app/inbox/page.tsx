'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OverageWarningModal } from '@/components/OverageWarningModal'
import { PurchaseCard } from '@/components/PurchaseCard'
import { formatUSD } from '@/lib/format'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

export default function InboxPage() {
  const receipts = useSpendGuardStore((state) => state.receipts)
  const approvePurchase = useSpendGuardStore((state) => state.approvePurchase)
  const declinePurchase = useSpendGuardStore((state) => state.declinePurchase)
  const overridePurchase = useSpendGuardStore((state) => state.overridePurchase)
  const [overage, setOverage] = useState<{ id: string; detail: string } | null>(null)

  const pending = receipts.filter((receipt) => receipt.status === 'needs_approval')
  const expired = receipts.filter((receipt) => receipt.status === 'expired')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Approvals inbox</h1>
        <p className="mt-1 text-sm text-stone-600">
          Approve checks the limit again without counting this purchase twice. If it no longer fits,
          you can decline or override once.
        </p>
      </header>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
          Nothing is waiting. <Link href="/simulator" className="font-medium text-teal-800">Submit a purchase</Link> that breaks a rule to see it here.
        </p>
      ) : (
        <div className="space-y-3">
          {pending.map((receipt) => (
            <PurchaseCard
              key={receipt.id}
              receipt={receipt}
              onApprove={() => {
                const detail = approvePurchase(receipt.id)
                if (detail) setOverage({ id: receipt.id, detail })
              }}
              onDecline={() => declinePurchase(receipt.id)}
            />
          ))}
        </div>
      )}

      {expired.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Expired</h2>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {expired.map((receipt) => (
              <li key={receipt.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-stone-900">{receipt.purchaseRequest.merchantName}</p>
                  <p className="text-stone-500">{receipt.purchaseRequest.category}</p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums text-stone-500">
                    {receipt.usdEquivalentAmount == null
                      ? 'USD unavailable'
                      : formatUSD(receipt.usdEquivalentAmount)}
                  </p>
                  <p className="text-xs font-medium text-stone-500">expired: monthly reset</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overage ? (
        <OverageWarningModal
          overageDetail={overage.detail}
          onDecline={() => {
            declinePurchase(overage.id)
            setOverage(null)
          }}
          onOverride={() => {
            overridePurchase(overage.id, overage.detail)
            setOverage(null)
          }}
        />
      ) : null}
    </div>
  )
}
