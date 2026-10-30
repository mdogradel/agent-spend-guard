import { FX_FALLBACK_AS_OF, lookupFallbackRate } from '@/lib/fx-fallback'
import type { FxRateCache, FxRateCacheEntry, FxRateSource } from '@/types'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface FxResult {
  usdAmount: number
  rate: number      // rate used for conversion (1 for USD passthrough)
  isStale: boolean  // true when a cached-but-expired rate was used
  failed: boolean   // true when no rate was available at all
  /** usd for a dollar charge, otherwise where the rate came from */
  source: 'usd' | FxRateSource
  /** When the quote was taken. Null for a USD passthrough or a total failure. */
  quotedAt: string | null
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
/** Short on purpose so a hung Frankfurter call does not stall the demo. */
export const FX_FETCH_TIMEOUT_MS = 2_500
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1/latest'

// ────────────────────────────────────────────────────────────
// Internal: Frankfurter API call
// Encapsulated in one place so the URL and response shape are easy to update.
// ────────────────────────────────────────────────────────────

/**
 * Fetch a single exchange rate from the Frankfurter API.
 * Returns the numeric rate on success, throws on any failure.
 *
 * Endpoint: GET /v1/latest?base={from}&symbols={to}
 * Response: { "amount": 1.0, "base": "EUR", "date": "...", "rates": { "USD": 1.113 } }
 */
export async function fetchFxRate(
  from: string,
  to: string,
  timeoutMs: number = FX_FETCH_TIMEOUT_MS,
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `${FRANKFURTER_BASE}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Frankfurter API returned ${response.status}`)
    }

    const data = await response.json() as { rates?: Record<string, number> }

    if (!data.rates || typeof data.rates[to] !== 'number') {
      throw new Error(`Unexpected response shape: rates.${to} not found`)
    }

    return data.rates[to]
  } finally {
    clearTimeout(timer)
  }
}

// ────────────────────────────────────────────────────────────
// Public: convertToUSD
// ────────────────────────────────────────────────────────────

/**
 * Convert an amount in `fromCurrency` to USD.
 *
 * Returns the FxResult and an (possibly updated) copy of the FX cache.
 * The caller is responsible for persisting the updatedCache to localStorage
 * before completing the purchase flow (write-before-confirm guarantee).
 */
export async function convertToUSD(
  amount: number,
  fromCurrency: string,
  cache: FxRateCache,
  timeoutMs: number = FX_FETCH_TIMEOUT_MS,
): Promise<{ result: FxResult; updatedCache: FxRateCache }> {
  // 1. USD passthrough — no API call needed
  if (fromCurrency.toUpperCase() === 'USD') {
    return {
      result: {
        usdAmount: amount,
        rate: 1,
        isStale: false,
        failed: false,
        source: 'usd',
        quotedAt: null,
      },
      updatedCache: cache,
    }
  }

  const now = Date.now()
  const cacheKey = fromCurrency.toUpperCase()
  const existing = cache[cacheKey]

  // 2. Cache hit: a live quote less than 24 hours old. A bundled fallback is never treated as fresh.
  if (
    existing &&
    existing.source !== 'fallback' &&
    now - new Date(existing.fetchedAt).getTime() < CACHE_TTL_MS
  ) {
    return {
      result: {
        usdAmount: roundTo6(amount * existing.rate),
        rate: existing.rate,
        isStale: false,
        failed: false,
        source: 'cache',
        quotedAt: existing.fetchedAt,
      },
      updatedCache: cache,
    }
  }

  // 3. Cache miss or stale: attempt a fresh fetch
  try {
    const freshRate = await fetchFxRate(fromCurrency, 'USD', timeoutMs)
    const roundedRate = roundTo6(freshRate)

    const fetchedAt = new Date().toISOString()
    const newEntry: FxRateCacheEntry = {
      fromCurrency: cacheKey,
      toCurrency: 'USD',
      rate: roundedRate,
      fetchedAt,
      isStale: false,
      source: 'live',
    }

    return {
      result: {
        usdAmount: roundTo6(amount * roundedRate),
        rate: roundedRate,
        isStale: false,
        failed: false,
        source: 'live',
        quotedAt: fetchedAt,
      },
      updatedCache: { ...cache, [cacheKey]: newEntry },
    }
  } catch {
    // Fetch failed (timeout, network error, bad shape, unknown currency).
    // A previously fetched rate is still better than the bundled snapshot.
    if (existing && existing.source !== 'fallback') {
      const staleEntry: FxRateCacheEntry = { ...existing, isStale: true, source: 'cache' }
      return {
        result: {
          usdAmount: roundTo6(amount * existing.rate),
          rate: existing.rate,
          isStale: true,
          failed: false,
          source: 'cache',
          quotedAt: existing.fetchedAt,
        },
        updatedCache: { ...cache, [cacheKey]: staleEntry },
      }
    }

    const bundled = lookupFallbackRate(cacheKey)
    if (bundled != null) {
      const roundedRate = roundTo6(bundled)
      // Do not cache this as a fresh live quote. The next purchase should try Frankfurter again.
      return {
        result: {
          usdAmount: roundTo6(amount * roundedRate),
          rate: roundedRate,
          isStale: false,
          failed: false,
          source: 'fallback',
          quotedAt: `${FX_FALLBACK_AS_OF}T00:00:00.000Z`,
        },
        updatedCache: cache,
      }
    }

    // Unsupported currency and nothing cached.
    return {
      result: {
        usdAmount: 0,
        rate: 0,
        isStale: false,
        failed: true,
        source: 'live',
        quotedAt: null,
      },
      updatedCache: cache,
    }
  }
}

/** Short label for the receipt and the dispute summary. */
export function describeRateSource(entry: Pick<FxRateCacheEntry, 'source' | 'isStale' | 'fetchedAt'>): string {
  if (entry.source === 'fallback') {
    const day = entry.fetchedAt.slice(0, 10)
    return `Fallback rate as of ${day}`
  }
  if (entry.isStale) return 'Cached rate, may be stale'
  if (entry.source === 'cache') return 'Cached live rate'
  return 'Live rate from Frankfurter'
}

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function roundTo6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
