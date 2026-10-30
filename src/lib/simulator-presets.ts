import type { PurchaseRequest } from '@/types'

export interface SimulatorPreset {
  id: 'coffee-shop' | 'hotel-lisbon' | 'grocery-run' | 'flight-tokyo'
  label: string
  description: string
  request: PurchaseRequest
}

const submittedAt = '2026-11-01T15:00:00.000Z'

function base(
  id: string,
  fields: Omit<PurchaseRequest, 'id' | 'submittedAt'>,
): PurchaseRequest {
  return { id, submittedAt, ...fields }
}

export const SIMULATOR_PRESETS: SimulatorPreset[] = [
  {
    id: 'coffee-shop',
    label: 'Coffee Shop',
    description: 'Small dining charge in USD',
    request: base('preset-coffee-shop', {
      agentName: 'Daily Assistant',
      merchantName: 'Blue Bottle Coffee',
      category: 'Dining',
      amount: 8.5,
      currency: 'USD',
      intentText: 'Grab a coffee, keep it under $15',
      structuredIntent: {
        maxBudgetAmount: 15,
        budgetCurrency: 'USD',
        intendedCategory: 'Dining',
      },
    }),
  },
  {
    id: 'hotel-lisbon',
    label: 'Hotel Lisbon',
    description: 'EUR hotel with a checkout date that is off by one day',
    request: base('preset-hotel-lisbon', {
      agentName: 'Travel Agent',
      merchantName: 'Hotel Lisbon',
      category: 'Travel',
      amount: 480,
      currency: 'EUR',
      intentText: 'Book a hotel in Lisbon under 500 EUR, November 12-14 2026',
      structuredIntent: {
        maxBudgetAmount: 500,
        budgetCurrency: 'EUR',
        travelDates: ['2026-11-12', '2026-11-14'],
        intendedCategory: 'Travel',
      },
      // Checkout is one day later than the intent, so the demo shows a date mismatch.
      travelDates: ['2026-11-12', '2026-11-15'],
    }),
  },
  {
    id: 'grocery-run',
    label: 'Grocery Run',
    description: 'Everyday grocery charge in USD',
    request: base('preset-grocery-run', {
      agentName: 'Household Agent',
      merchantName: 'Corner Market',
      category: 'Groceries',
      amount: 95,
      currency: 'USD',
      intentText: 'Weekly grocery run, stay around $120',
      structuredIntent: {
        maxBudgetAmount: 120,
        budgetCurrency: 'USD',
        intendedCategory: 'Groceries',
      },
    }),
  },
  {
    id: 'flight-tokyo',
    label: 'Flight Tokyo',
    description: 'JPY flight whose dates match the intent',
    request: base('preset-flight-tokyo', {
      agentName: 'Travel Agent',
      merchantName: 'ANA',
      category: 'Travel',
      amount: 85000,
      currency: 'JPY',
      intentText: 'Round trip flight to Tokyo, March 1-8 2027',
      structuredIntent: {
        maxBudgetAmount: 100000,
        budgetCurrency: 'JPY',
        travelDates: ['2027-03-01', '2027-03-08'],
        intendedCategory: 'Travel',
      },
      travelDates: ['2027-03-01', '2027-03-08'],
    }),
  },
]

export function findPreset(id: string): SimulatorPreset | undefined {
  return SIMULATOR_PRESETS.find((preset) => preset.id === id)
}

/** Copy a preset so the form can edit it without changing the original. */
export function clonePresetRequest(preset: SimulatorPreset): PurchaseRequest {
  return {
    ...preset.request,
    structuredIntent: preset.request.structuredIntent
      ? { ...preset.request.structuredIntent, travelDates: preset.request.structuredIntent.travelDates?.slice() }
      : null,
    travelDates: preset.request.travelDates?.slice(),
  }
}
