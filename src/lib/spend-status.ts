export type SpendVisualState = 'ok' | 'warning' | 'exceeded'

/**
 * Warning starts at 80% and stops once the limit is reached.
 * Exceeded and warning never apply together.
 */
export function spendVisualState(committed: number, limit: number): SpendVisualState {
  if (!(limit > 0) || !Number.isFinite(committed) || !Number.isFinite(limit)) return 'ok'
  if (committed >= limit) return 'exceeded'
  if (committed / limit >= 0.8) return 'warning'
  return 'ok'
}
