import { describe, expect, it } from 'vitest'
import { agentLabel, summarizeByAgent, UNKNOWN_AGENT } from '../agents'
import { SIMULATOR_PRESETS } from '../simulator-presets'
import type { IntentReceipt } from '@/types'

function receipt(agentName: string, usd: number, submittedAt: string): IntentReceipt {
  return {
    id: `${agentName}-${submittedAt}`,
    purchaseRequest: {
      id: `${agentName}-${submittedAt}`,
      agentName,
      merchantName: 'Shop',
      category: 'Dining',
      amount: usd,
      currency: 'USD',
      intentText: 'buy it',
      structuredIntent: null,
      submittedAt,
    },
    usdEquivalentAmount: usd,
    fxRate: null,
    decision: {
      outcome: 'auto_approved',
      failures: [],
      explanation: '',
      evaluatedAt: submittedAt,
    },
    status: 'auto_approved',
    mismatches: [],
    priceCheckSkipped: false,
    approvedAt: submittedAt,
    declinedAt: null,
    overrideLog: null,
    createdAt: submittedAt,
    updatedAt: submittedAt,
  }
}

describe('agentLabel', () => {
  it('keeps a named agent', () => {
    expect(agentLabel('Travel Agent')).toBe('Travel Agent')
  })

  it('uses Unknown agent when the stored name is missing or blank', () => {
    expect(agentLabel('')).toBe(UNKNOWN_AGENT)
    expect(agentLabel('   ')).toBe(UNKNOWN_AGENT)
    expect(agentLabel(undefined)).toBe(UNKNOWN_AGENT)
    expect(agentLabel(null)).toBe(UNKNOWN_AGENT)
  })
})

describe('simulator presets', () => {
  it('gives each preset a recognizable agent', () => {
    const byId = Object.fromEntries(SIMULATOR_PRESETS.map((preset) => [preset.id, preset.request.agentName]))
    expect(byId['coffee-shop']).toBe('Dining Assistant')
    expect(byId['hotel-lisbon']).toBe('Travel Agent')
    expect(byId['grocery-run']).toBe('Shopping Agent')
    expect(byId['flight-tokyo']).toBe('Travel Agent')
  })
})

describe('summarizeByAgent', () => {
  it('counts purchases, sums USD, and keeps the latest time', () => {
    const rows = summarizeByAgent([
      receipt('Travel Agent', 100, '2026-11-01T10:00:00.000Z'),
      receipt('', 8.5, '2026-11-02T10:00:00.000Z'),
      receipt('Travel Agent', 50, '2026-11-03T15:00:00.000Z'),
    ])

    expect(rows).toEqual([
      {
        name: 'Travel Agent',
        count: 2,
        totalUsd: 150,
        lastAt: '2026-11-03T15:00:00.000Z',
      },
      {
        name: UNKNOWN_AGENT,
        count: 1,
        totalUsd: 8.5,
        lastAt: '2026-11-02T10:00:00.000Z',
      },
    ])
  })
})
