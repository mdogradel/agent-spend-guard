import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkMismatches } from '../mismatch-checker'
import { evaluateRules } from '../rules-engine'
import { FX_FALLBACK_AS_OF, FX_FALLBACK_RATES } from '../fx-fallback'
import { SIMULATOR_PRESETS } from '../simulator-presets'
import { convertToUSD, describeRateSource, fetchFxRate, FX_FETCH_TIMEOUT_MS } from '../fx-service'
import type { FxRateCache } from '@/types'

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeCacheEntry(
  rate: number,
  ageMs: number,             // how old the entry is in milliseconds
  isStale = false,
) {
  const fetchedAt = new Date(Date.now() - ageMs).toISOString()
  return {
    fromCurrency: 'EUR',
    toCurrency: 'USD' as const,
    rate,
    fetchedAt,
    isStale,
  }
}

function mockFetch(rate: number) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ amount: 1, base: 'EUR', date: '2024-11-01', rates: { USD: rate } }),
  })
}

function mockFetchFail() {
  return vi.fn().mockRejectedValueOnce(new Error('network error'))
}

function mockFetchTimeout() {
  return vi.fn().mockImplementation(
    (_url: string, opts: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
        // never resolves
      }),
  )
}

// ────────────────────────────────────────────────────────────
// fetchFxRate
// ────────────────────────────────────────────────────────────

describe('fetchFxRate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('parses and returns rates.USD from the Frankfurter response', async () => {
    vi.stubGlobal('fetch', mockFetch(1.113))
    const rate = await fetchFxRate('EUR', 'USD')
    expect(rate).toBe(1.113)
  })

  it('throws when the API returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 422 }))
    await expect(fetchFxRate('XYZ', 'USD')).rejects.toThrow('422')
  })

  it('throws when rates.USD is missing from the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rates: {} }),
      }),
    )
    await expect(fetchFxRate('EUR', 'USD')).rejects.toThrow('Unexpected response shape')
  })
})

// ────────────────────────────────────────────────────────────
// convertToUSD
// ────────────────────────────────────────────────────────────

describe('convertToUSD — USD passthrough', () => {
  it('returns amount unchanged with rate=1, no fetch, not stale, not failed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { result, updatedCache } = await convertToUSD(42, 'USD', {})
    expect(result).toEqual({
      usdAmount: 42,
      rate: 1,
      isStale: false,
      failed: false,
      source: 'usd',
      quotedAt: null,
    })
    expect(updatedCache).toEqual({})
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('is case-insensitive — "usd" also bypasses the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { result } = await convertToUSD(10, 'usd', {})
    expect(result.rate).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('convertToUSD — cache hit (< 24 h)', () => {
  it('uses the cached rate without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const cache: FxRateCache = { EUR: makeCacheEntry(1.1, 1_000) } // 1 second old

    const { result, updatedCache } = await convertToUSD(100, 'EUR', cache)

    expect(result.rate).toBe(1.1)
    expect(result.usdAmount).toBeCloseTo(110, 5)
    expect(result.isStale).toBe(false)
    expect(result.failed).toBe(false)
    expect(updatedCache).toEqual(cache) // cache unchanged
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('convertToUSD — cache miss / stale (≥ 24 h)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches a fresh rate, updates the cache, returns fresh result', async () => {
    vi.stubGlobal('fetch', mockFetch(1.2))
    const staleCache: FxRateCache = {
      EUR: makeCacheEntry(1.0, 25 * 60 * 60 * 1000), // 25 hours old
    }

    const { result, updatedCache } = await convertToUSD(50, 'EUR', staleCache)

    expect(result.rate).toBe(1.2)
    expect(result.usdAmount).toBeCloseTo(60, 5)
    expect(result.isStale).toBe(false)
    expect(result.failed).toBe(false)
    expect(updatedCache.EUR.rate).toBe(1.2)
    expect(updatedCache.EUR.isStale).toBe(false)
  })

  it('fetches a fresh rate when cache is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(1.5))

    const { result, updatedCache } = await convertToUSD(200, 'EUR', {})

    expect(result.rate).toBe(1.5)
    expect(result.usdAmount).toBeCloseTo(300, 5)
    expect(updatedCache.EUR.rate).toBe(1.5)
  })
})

describe('convertToUSD — API failure with stale cache', () => {
  afterEach(() => vi.restoreAllMocks())

  it('falls back to stale cache entry, sets isStale=true', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const staleCache: FxRateCache = {
      EUR: makeCacheEntry(1.05, 30 * 60 * 60 * 1000), // 30 hours old
    }

    const { result, updatedCache } = await convertToUSD(100, 'EUR', staleCache)

    expect(result.rate).toBe(1.05)
    expect(result.isStale).toBe(true)
    expect(result.failed).toBe(false)
    expect(updatedCache.EUR.isStale).toBe(true)
  })

  it('falls back on timeout with stale cache, sets isStale=true', async () => {
    vi.stubGlobal('fetch', mockFetchTimeout())
    const staleCache: FxRateCache = {
      EUR: makeCacheEntry(1.08, 48 * 60 * 60 * 1000),
    }

    const { result } = await convertToUSD(100, 'EUR', staleCache, 50) // 50ms timeout

    expect(result.isStale).toBe(true)
    expect(result.failed).toBe(false)
  })
})

describe('convertToUSD — bundled fallback when live quote fails', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the dated EUR fallback when Frankfurter errors and nothing is cached', async () => {
    vi.stubGlobal('fetch', mockFetchFail())

    const { result, updatedCache } = await convertToUSD(480, 'EUR', {})

    expect(result.failed).toBe(false)
    expect(result.isStale).toBe(false)
    expect(result.source).toBe('fallback')
    expect(result.rate).toBe(FX_FALLBACK_RATES.EUR)
    expect(result.quotedAt).toBe(`${FX_FALLBACK_AS_OF}T00:00:00.000Z`)
    expect(result.usdAmount).toBeCloseTo(480 * FX_FALLBACK_RATES.EUR, 5)
    expect(updatedCache).toEqual({})
    expect(describeRateSource({
      source: 'fallback',
      isStale: false,
      fetchedAt: result.quotedAt!,
    })).toBe(`Fallback rate as of ${FX_FALLBACK_AS_OF}`)
  })

  it('uses the fallback when the live call exceeds the short timeout', async () => {
    vi.stubGlobal('fetch', mockFetchTimeout())

    const { result } = await convertToUSD(100, 'JPY', {}, 50)

    expect(result.failed).toBe(false)
    expect(result.source).toBe('fallback')
    expect(result.rate).toBe(FX_FALLBACK_RATES.JPY)
  })

  it('keeps the default timeout short enough for the demo', () => {
    expect(FX_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(2_000)
    expect(FX_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(3_000)
  })

  it('still prefers a successful live quote over the bundled table', async () => {
    vi.stubGlobal('fetch', mockFetch(1.25))

    const { result } = await convertToUSD(100, 'EUR', {})

    expect(result.source).toBe('live')
    expect(result.rate).toBe(1.25)
    expect(result.failed).toBe(false)
  })
})

describe('convertToUSD — unsupported currency, no cache', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns failed=true when the currency is not in the fallback table and the fetch fails', async () => {
    vi.stubGlobal('fetch', mockFetchFail())

    const { result, updatedCache } = await convertToUSD(100, 'XYZ', {})

    expect(result.failed).toBe(true)
    expect(result.usdAmount).toBe(0)
    expect(result.rate).toBe(0)
    expect(updatedCache).toEqual({})
  })

  it('returns failed=true on timeout for an unsupported currency with no cache', async () => {
    vi.stubGlobal('fetch', mockFetchTimeout())

    const { result } = await convertToUSD(100, 'XYZ', {}, 50)

    expect(result.failed).toBe(true)
  })
})

describe('Hotel Lisbon when Frankfurter does not answer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('converts 480 EUR with the fallback, stays inside a $2,000 Travel limit, and still flags the date', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const hotel = SIMULATOR_PRESETS.find((preset) => preset.id === 'hotel-lisbon')
    expect(hotel).toBeTruthy()
    const request = hotel!.request

    const { result } = await convertToUSD(request.amount, request.currency, {})
    expect(result.failed).toBe(false)
    expect(result.source).toBe('fallback')
    expect(result.usdAmount).toBeLessThan(2_000)

    const decision = evaluateRules(
      {
        request,
        usdAmount: result.usdAmount,
        fxFailed: result.failed,
        rules: {
          categoryLimits: [
            {
              id: 'travel',
              type: 'category_limit',
              category: 'Travel',
              limitAmountUSD: 2_000,
              createdAt: '2026-10-30T00:00:00.000Z',
              updatedAt: '2026-10-30T00:00:00.000Z',
            },
          ],
          merchantLimits: [],
          approvalThreshold: null,
          blockedCategories: [],
        },
        committedSpend: { byCategory: {}, byMerchant: {} },
      },
      '2026-10-30T00:00:00.000Z',
    )
    expect(decision.outcome).toBe('auto_approved')
    expect(decision.failures.some((failure) => failure.ruleType === 'fx_failed')).toBe(false)

    const mismatch = checkMismatches(
      request.structuredIntent,
      request.intentText,
      request,
      result.usdAmount,
      {},
    )
    expect(mismatch.flags.map((flag) => flag.type)).toEqual(['date_mismatch'])
  })
})

describe('convertToUSD — rate rounding', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rounds stored rate and converted amount to 6 decimal places', async () => {
    vi.stubGlobal('fetch', mockFetch(1.123456789))

    const { result, updatedCache } = await convertToUSD(100, 'EUR', {})

    // rate stored at 6dp
    expect(updatedCache.EUR.rate).toBe(1.123457)
    // usdAmount rounded to 6dp
    expect(result.usdAmount).toBe(112.3457)
  })
})
