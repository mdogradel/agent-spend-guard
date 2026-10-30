/**
 * USD value of 1 unit of foreign currency.
 * Snapshot from Frankfurter on 2026-10-30 (rates.USD).
 * Used only when a live quote does not arrive. Labeled as a fallback on the receipt.
 */
export const FX_FALLBACK_AS_OF = '2026-10-30'

export const FX_FALLBACK_RATES: Record<string, number> = {
  EUR: 1.1172,
  GBP: 1.3399,
  JPY: 0.006359,
  CAD: 0.71588,
  AUD: 0.70246,
  CHF: 1.2151,
  SEK: 0.10177,
  NZD: 0.56359,
}

export function lookupFallbackRate(currency: string): number | null {
  const rate = FX_FALLBACK_RATES[currency.trim().toUpperCase()]
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null
  return rate
}
