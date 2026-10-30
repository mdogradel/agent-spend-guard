import type { FxRateCache, FxRateCacheEntry } from '@/types'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface FxResult {
  usdAmount: number
  rate: number      // rate used for conversion (1 for USD passthrough)
  isStale: boolean  // true when a cached-but-expired rate was used
  failed: boolean   // true when no rate was available at all
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
const DEFAULT_TIMEOUT_MS = 5_000
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
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
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
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ result: FxResult; updatedCache: FxRateCache }> {
  // 1. USD passthrough — no API call needed
  if (fromCurrency.toUpperCase() === 'USD') {
    return {
      result: { usdAmount: amount, rate: 1, isStale: false, failed: false },
      updatedCache: cache,
    }
  }

  const now = Date.now()
  const cacheKey = fromCurrency.toUpperCase()
  const existing = cache[cacheKey]

  // 2. Cache hit: entry exists and is less than 24 hours old
  if (existing && now - new Date(existing.fetchedAt).getTime() < CACHE_TTL_MS) {
    return {
      result: {
        usdAmount: roundTo6(amount * existing.rate),
        rate: existing.rate,
        isStale: false,
        failed: false,
      },
      updatedCache: cache,
    }
  }

  // 3. Cache miss or stale: attempt a fresh fetch
  try {
    const freshRate = await fetchFxRate(fromCurrency, 'USD', timeoutMs)
    const roundedRate = roundTo6(freshRate)

    const newEntry: FxRateCacheEntry = {
      fromCurrency: cacheKey,
      toCurrency: 'USD',
      rate: roundedRate,
      fetchedAt: new Date().toISOString(),
      isStale: false,
    }

    return {
      result: {
        usdAmount: roundTo6(amount * roundedRate),
        rate: roundedRate,
        isStale: false,
        failed: false,
      },
      updatedCache: { ...cache, [cacheKey]: newEntry },
    }
  } catch {
    // Fetch failed (timeout, network error, bad shape, unknown currency)
    // Fall back to stale cache entry if available
    if (existing) {
      const staleEntry: FxRateCacheEntry = { ...existing, isStale: true }
      return {
        result: {
          usdAmount: roundTo6(amount * existing.rate),
          rate: existing.rate,
          isStale: true,
          failed: false,
        },
        updatedCache: { ...cache, [cacheKey]: staleEntry },
      }
    }

    // No cache at all — conversion failed entirely
    return {
      result: { usdAmount: 0, rate: 0, isStale: false, failed: true },
      updatedCache: cache,
    }
  }
}

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function roundTo6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
