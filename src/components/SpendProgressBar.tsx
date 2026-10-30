import { formatUSD } from '@/lib/format'
import { spendVisualState } from '@/lib/spend-status'

interface SpendProgressBarProps {
  label: string
  committed: number
  limit: number
}

const BAR: Record<string, string> = {
  ok: 'bg-teal-700',
  warning: 'bg-amber-500',
  exceeded: 'bg-red-600',
}

const TEXT: Record<string, string> = {
  ok: 'text-stone-600',
  warning: 'text-amber-800',
  exceeded: 'text-red-700',
}

export function SpendProgressBar({ label, committed, limit }: SpendProgressBarProps) {
  const state = spendVisualState(committed, limit)
  const ratio = limit > 0 ? committed / limit : 0
  const width = Math.max(0, Math.min(100, ratio * 100))
  const remaining = limit - committed

  return (
    <div data-testid="spend-progress" data-state={state} className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-stone-900">{label}</span>
        <span className={TEXT[state]}>
          {formatUSD(committed)} of {formatUSD(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full rounded-full ${BAR[state]}`} style={{ width: `${width}%` }} />
      </div>
      <p className={`text-xs ${TEXT[state]}`}>
        {state === 'exceeded'
          ? `${formatUSD(Math.abs(remaining))} over the limit`
          : `${formatUSD(Math.max(0, remaining))} remaining`}
        {state === 'warning' ? ' · at or above 80%' : ''}
      </p>
    </div>
  )
}
