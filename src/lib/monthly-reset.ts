import type { IntentReceipt } from '@/types'

/** "YYYY-MM" in the local timezone of `date`. */
export function getMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Expire pending receipts that originated before `currentMonth`.
 * A null last-seen month is the first run: record the month and expire nothing.
 * Approved, declined, and already-expired receipts are left alone.
 */
export function applyMonthlyReset(
  receipts: IntentReceipt[],
  lastSeenMonth: string | null,
  currentMonth: string,
  now = new Date().toISOString(),
): { receipts: IntentReceipt[]; lastSeenMonth: string; changed: boolean } {
  if (lastSeenMonth == null) {
    return { receipts, lastSeenMonth: currentMonth, changed: true }
  }

  if (lastSeenMonth === currentMonth) {
    return { receipts, lastSeenMonth, changed: false }
  }

  const next = receipts.map((receipt) => {
    if (receipt.status !== 'needs_approval') return receipt
    const origin = getMonthKey(new Date(receipt.purchaseRequest.submittedAt))
    if (origin >= currentMonth) return receipt
    return { ...receipt, status: 'expired' as const, updatedAt: now }
  })

  return { receipts: next, lastSeenMonth: currentMonth, changed: true }
}
