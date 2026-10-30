'use client'

import { useSpendGuardStore } from '@/store/useSpendGuardStore'

export function StorageWarningBanner() {
  const warning = useSpendGuardStore((state) => state.storageWarning)
  const message = useSpendGuardStore((state) => state.storageWarningMessage)
  const dismiss = useSpendGuardStore((state) => state.dismissStorageWarning)

  if (!warning) return null

  return (
    <div
      role="status"
      data-testid="storage-warning"
      className="border-b border-amber-200 bg-amber-50 text-amber-950"
    >
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-4 px-4 py-2 text-sm">
        <p>{message ?? 'Browser storage reported a problem. Your latest change may not be saved.'}</p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
