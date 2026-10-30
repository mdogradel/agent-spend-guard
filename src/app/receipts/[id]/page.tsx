'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DisputeSummaryPanel } from '@/components/DisputeSummaryPanel'
import { IntentReceiptDetail } from '@/components/IntentReceiptDetail'
import { shouldShowDisputeButton } from '@/lib/dispute-generator'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'

export default function ReceiptDetailPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const receipt = useSpendGuardStore((state) => state.receipts.find((entry) => entry.id === id))

  if (!receipt) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-stone-900">Receipt not found</h1>
        <Link href="/receipts" className="text-sm font-medium text-teal-800">
          Back to receipts
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/receipts" className="text-sm font-medium text-teal-800">
        All receipts
      </Link>
      <IntentReceiptDetail receipt={receipt} />
      {shouldShowDisputeButton(receipt) ? <DisputeSummaryPanel receipt={receipt} /> : null}
    </div>
  )
}
