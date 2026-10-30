import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  safeRead,
  safeWrite,
  isLocalStorageAvailable,
  STORAGE_KEYS,
  readRules,
  writeRules,
} from '../persistence'

// jsdom provides a real localStorage; we spy on it per-test

describe('isLocalStorageAvailable', () => {
  it('returns true in a normal jsdom environment', () => {
    expect(isLocalStorageAvailable()).toBe(true)
  })

  it('returns false when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(isLocalStorageAvailable()).toBe(false)
    spy.mockRestore()
  })
})

describe('safeRead', () => {
  beforeEach(() => localStorage.clear())

  it('returns fallback when key is missing', () => {
    expect(safeRead('nonexistent', 42)).toBe(42)
  })

  it('parses and returns a valid JSON value', () => {
    localStorage.setItem('asg_test', JSON.stringify({ x: 1 }))
    expect(safeRead('asg_test', null)).toEqual({ x: 1 })
  })

  it('returns fallback and does not throw when value is corrupt JSON', () => {
    localStorage.setItem('asg_test', 'NOT_VALID_JSON{{{{')
    expect(safeRead('asg_test', 'fallback')).toBe('fallback')
  })

  it('returns fallback for an array type when stored value is corrupt', () => {
    localStorage.setItem(STORAGE_KEYS.receipts, '[[broken')
    expect(safeRead(STORAGE_KEYS.receipts, [])).toEqual([])
  })

  it('isolates corrupt entries — other keys still read correctly', () => {
    localStorage.setItem('asg_good', JSON.stringify({ ok: true }))
    localStorage.setItem('asg_bad', '{{CORRUPT')
    expect(safeRead('asg_good', null)).toEqual({ ok: true })
    expect(safeRead('asg_bad', 'default')).toBe('default')
  })
})

describe('safeWrite', () => {
  beforeEach(() => localStorage.clear())

  it('writes a value and returns true on success', () => {
    const result = safeWrite('asg_test', { hello: 'world' })
    expect(result).toBe(true)
    expect(JSON.parse(localStorage.getItem('asg_test')!)).toEqual({ hello: 'world' })
  })

  it('returns false when setItem throws QuotaExceededError', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const result = safeWrite('asg_test', { data: 123 })
    expect(result).toBe(false)
    spy.mockRestore()
  })

  it('returns false when setItem throws a SecurityError', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    const result = safeWrite('asg_test', 'value')
    expect(result).toBe(false)
    spy.mockRestore()
  })
})

describe('typed helpers — readRules / writeRules round-trip', () => {
  beforeEach(() => localStorage.clear())

  it('returns default empty RuleSet when nothing is stored', () => {
    const rules = readRules()
    expect(rules.categoryLimits).toEqual([])
    expect(rules.merchantLimits).toEqual([])
    expect(rules.approvalThreshold).toBeNull()
    expect(rules.blockedCategories).toEqual([])
  })

  it('round-trips a RuleSet through write → read', () => {
    const ruleSet = {
      categoryLimits: [{ id: '1', type: 'category_limit' as const, category: 'Dining', limitAmountUSD: 300, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }],
      merchantLimits: [],
      approvalThreshold: null,
      blockedCategories: [],
    }
    expect(writeRules(ruleSet)).toBe(true)
    expect(readRules()).toEqual(ruleSet)
  })
})
