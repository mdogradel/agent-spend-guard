'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { describeRateSource } from '@/lib/fx-service'
import { formatUSD } from '@/lib/format'
import { agentLabel } from '@/lib/agents'
import { clonePresetRequest, findPreset, SIMULATOR_PRESETS } from '@/lib/simulator-presets'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'
import type { IntentReceipt, PurchaseRequest, StructuredIntent } from '@/types'

function splitDates(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function SimulatorForm() {
  const submitPurchase = useSpendGuardStore((state) => state.submitPurchase)
  const [presetId, setPresetId] = useState('')
  const [agentName, setAgentName] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [intentText, setIntentText] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [budgetCurrency, setBudgetCurrency] = useState('')
  const [travelDates, setTravelDates] = useState('')
  const [intendedCategory, setIntendedCategory] = useState('')
  const [purchaseDates, setPurchaseDates] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<IntentReceipt | null>(null)

  function applyPreset(id: string) {
    setPresetId(id)
    setResult(null)
    setError(null)
    const preset = findPreset(id)
    if (!preset) return
    const request = clonePresetRequest(preset)
    const intent = request.structuredIntent
    setAgentName(request.agentName)
    setMerchantName(request.merchantName)
    setCategory(request.category)
    setAmount(String(request.amount))
    setCurrency(request.currency)
    setIntentText(request.intentText ?? '')
    setMaxBudget(intent?.maxBudgetAmount == null ? '' : String(intent.maxBudgetAmount))
    setBudgetCurrency(intent?.budgetCurrency ?? '')
    setTravelDates(intent?.travelDates?.join(', ') ?? '')
    setIntendedCategory(intent?.intendedCategory ?? '')
    setPurchaseDates(request.travelDates?.join(', ') ?? '')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Amount must be greater than zero.')
      return
    }

    let maxBudgetAmount: number | undefined
    if (maxBudget.trim()) {
      maxBudgetAmount = Number(maxBudget)
      if (!Number.isFinite(maxBudgetAmount)) {
        setError('Max budget must be a number.')
        return
      }
    }

    const intentDates = splitDates(travelDates)
    const structured: StructuredIntent = {}
    if (maxBudgetAmount != null) structured.maxBudgetAmount = maxBudgetAmount
    if (budgetCurrency.trim()) structured.budgetCurrency = budgetCurrency.trim()
    if (intentDates.length > 0) structured.travelDates = intentDates
    if (intendedCategory.trim()) structured.intendedCategory = intendedCategory.trim()

    const booked = splitDates(purchaseDates)
    const request: PurchaseRequest = {
      id: crypto.randomUUID(),
      agentName: agentLabel(agentName),
      merchantName: merchantName.trim() || 'Merchant',
      category: category.trim() || 'General',
      amount: numeric,
      currency: currency.trim() || 'USD',
      intentText: intentText.trim() ? intentText : null,
      structuredIntent: Object.keys(structured).length > 0 ? structured : null,
      ...(booked.length > 0 ? { travelDates: booked } : {}),
      submittedAt: new Date().toISOString(),
    }

    setPending(true)
    try {
      const receipt = await submitPurchase(request)
      setResult(receipt)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Preset</span>
          <select
            aria-label="Preset"
            value={presetId}
            onChange={(event) => applyPreset(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            <option value="">Custom</option>
            {SIMULATOR_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Agent name" value={agentName} onChange={setAgentName} />
          <Field label="Merchant name" value={merchantName} onChange={setMerchantName} />
          <Field label="Category" value={category} onChange={setCategory} />
          <Field label="Amount" value={amount} onChange={setAmount} />
          <Field label="Currency" value={currency} onChange={setCurrency} />
          <Field label="Intended category" value={intendedCategory} onChange={setIntendedCategory} />
          <Field label="Max budget" value={maxBudget} onChange={setMaxBudget} />
          <Field label="Budget currency" value={budgetCurrency} onChange={setBudgetCurrency} />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Intent</span>
          <textarea
            aria-label="Intent"
            value={intentText}
            onChange={(event) => setIntentText(event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <Field label="Intent travel dates" value={travelDates} onChange={setTravelDates} />
        <Field label="Purchase dates" value={purchaseDates} onChange={setPurchaseDates} />

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
        >
          {pending ? 'Checking…' : 'Submit purchase'}
        </button>
      </form>

      {result ? (
        <div data-testid="decision-result" className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <span className="font-medium text-stone-800">{result.decision.outcome}</span>
          </div>
          <p className="mt-2 text-stone-700">
            {result.decision.explanation || 'Every rule passed.'}
          </p>
          {result.fxRate && result.usdEquivalentAmount != null ? (
            <p className="mt-2 text-stone-700" data-testid="fx-source">
              {formatUSD(result.usdEquivalentAmount)} · 1 {result.fxRate.fromCurrency} ={' '}
              {result.fxRate.rate.toFixed(6)} USD · {describeRateSource(result.fxRate)}
            </p>
          ) : null}
          {result.mismatches.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-orange-800">
              {result.mismatches.map((flag) => (
                <li key={flag.type}>{flag.detail}</li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`/receipts/${result.id}`}
            data-testid="view-receipt"
            className="mt-3 inline-block font-medium text-teal-800"
          >
            View receipt
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-stone-600">{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-stone-300 px-3 py-2"
      />
    </label>
  )
}
