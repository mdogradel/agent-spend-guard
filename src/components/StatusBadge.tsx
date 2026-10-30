import type { PurchaseStatus } from '@/types'

const LABEL: Record<PurchaseStatus, string> = {
  auto_approved: 'Approved',
  approved: 'Approved',
  needs_approval: 'Needs approval',
  declined: 'Declined',
  expired: 'Expired',
}

const CLASS_NAME: Record<PurchaseStatus, string> = {
  auto_approved: 'bg-teal-50 text-teal-800',
  approved: 'bg-teal-50 text-teal-800',
  needs_approval: 'bg-amber-50 text-amber-800',
  declined: 'bg-red-50 text-red-700',
  expired: 'bg-stone-100 text-stone-600',
}

export function StatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_NAME[status]}`}
    >
      {LABEL[status]}
    </span>
  )
}
