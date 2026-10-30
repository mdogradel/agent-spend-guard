'use client'

interface OverageWarningModalProps {
  overageDetail: string
  onDecline: () => void
  onOverride: () => void
}

export function OverageWarningModal({
  overageDetail,
  onDecline,
  onOverride,
}: OverageWarningModalProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Approval warning"
        data-testid="overage-modal"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-stone-900">This would go over a limit</h2>
        <p className="mt-2 text-sm text-stone-700">{overageDetail}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onOverride}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Override Once
          </button>
        </div>
      </div>
    </div>
  )
}
