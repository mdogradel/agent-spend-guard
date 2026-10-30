'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { namesMatch } from '@/lib/rules-engine'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'
import type { IntentReceipt, RuleSet, SpendingRule } from '@/types'

const MIN_AMOUNT = 0.01
const MAX_AMOUNT = 999_999_999.99

type RuleKind = SpendingRule['type']

interface RuleFormProps {
  initial?: SpendingRule | null
  onCancel?: () => void
  onSaved?: () => void
}

function nameOf(rule: SpendingRule): string {
  if (rule.type === 'category_limit' || rule.type === 'blocked_category') return rule.category
  if (rule.type === 'merchant_limit') return rule.merchant
  return ''
}

function amountOf(rule: SpendingRule): string {
  if (rule.type === 'category_limit' || rule.type === 'merchant_limit') return String(rule.limitAmountUSD)
  if (rule.type === 'approval_threshold') return String(rule.thresholdAmountUSD)
  return ''
}

function duplicateName(rules: RuleSet, kind: RuleKind, name: string, ignoreId: string | null): boolean {
  if (kind === 'category_limit') {
    return rules.categoryLimits.some((rule) => rule.id !== ignoreId && rule.category === name)
  }
  if (kind === 'merchant_limit') {
    return rules.merchantLimits.some((rule) => rule.id !== ignoreId && rule.merchant === name)
  }
  if (kind === 'blocked_category') {
    return rules.blockedCategories.some((rule) => rule.id !== ignoreId && rule.category === name)
  }
  return false
}

function pendingAffected(rule: SpendingRule, receipts: IntentReceipt[]): number {
  const pending = receipts.filter((receipt) => receipt.status === 'needs_approval')
  if (rule.type === 'category_limit' || rule.type === 'blocked_category') {
    return pending.filter((receipt) => namesMatch(receipt.purchaseRequest.category, rule.category)).length
  }
  if (rule.type === 'merchant_limit') {
    return pending.filter((receipt) => namesMatch(receipt.purchaseRequest.merchantName, rule.merchant)).length
  }
  return pending.length
}

export function RuleForm({ initial = null, onCancel, onSaved }: RuleFormProps) {
  const rules = useSpendGuardStore((state) => state.rules)
  const receipts = useSpendGuardStore((state) => state.receipts)
  const addRule = useSpendGuardStore((state) => state.addRule)
  const updateRule = useSpendGuardStore((state) => state.updateRule)

  const [kind, setKind] = useState<RuleKind>(initial?.type ?? 'category_limit')
  const [name, setName] = useState(initial ? nameOf(initial) : '')
  const [amount, setAmount] = useState(initial ? amountOf(initial) : '')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const affected = useMemo(
    () => (initial ? pendingAffected(initial, receipts) : 0),
    [initial, receipts],
  )
  const needsName = kind !== 'approval_threshold'
  const needsAmount = kind !== 'blocked_category'
  const nameLabel = kind === 'merchant_limit' ? 'Merchant' : 'Category'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (needsName && (trimmed.length < 1 || trimmed.length > 100)) {
      setError('Name must be between 1 and 100 characters.')
      return
    }

    let numeric = 0
    if (needsAmount) {
      numeric = Number(amount)
      if (!Number.isFinite(numeric) || numeric < MIN_AMOUNT || numeric > MAX_AMOUNT) {
        setError('Amount must be a positive value up to 999,999,999.99 USD.')
        return
      }
    }

    if (needsName && duplicateName(rules, kind, trimmed, initial?.id ?? null)) {
      setError('A rule for that name already exists.')
      return
    }

    if (initial && affected > 0 && !acknowledged) {
      setError(`This affects ${affected} pending purchase${affected === 1 ? '' : 's'}. Confirm before saving.`)
      return
    }

    const now = new Date().toISOString()
    const id = initial?.id ?? crypto.randomUUID()
    let next: SpendingRule

    if (kind === 'category_limit') {
      next = {
        id,
        type: 'category_limit',
        category: trimmed,
        limitAmountUSD: numeric,
        createdAt: initial?.type === 'category_limit' ? initial.createdAt : now,
        updatedAt: now,
      }
    } else if (kind === 'merchant_limit') {
      next = {
        id,
        type: 'merchant_limit',
        merchant: trimmed,
        limitAmountUSD: numeric,
        createdAt: initial?.type === 'merchant_limit' ? initial.createdAt : now,
        updatedAt: now,
      }
    } else if (kind === 'blocked_category') {
      next = {
        id,
        type: 'blocked_category',
        category: trimmed,
        createdAt: initial?.type === 'blocked_category' ? initial.createdAt : now,
      }
    } else {
      next = {
        id,
        type: 'approval_threshold',
        thresholdAmountUSD: numeric,
        updatedAt: now,
      }
    }

    const failure = initial ? updateRule(next) : addRule(next)
    if (failure) {
      setError(failure)
      return
    }
    onSaved?.()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-600">Rule type</span>
        <select
          aria-label="Rule type"
          value={kind}
          disabled={initial != null}
          onChange={(event) => setKind(event.target.value as RuleKind)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2"
        >
          <option value="category_limit">Category limit</option>
          <option value="merchant_limit">Merchant limit</option>
          <option value="approval_threshold">Approval threshold</option>
          <option value="blocked_category">Blocked category</option>
        </select>
      </label>

      {needsName ? (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">{nameLabel}</span>
          <input
            aria-label={nameLabel}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
      ) : null}

      {needsAmount ? (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Amount (USD)</span>
          <input
            aria-label="Amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
      ) : null}

      {initial && affected > 0 ? (
        <label className="flex items-start gap-2 text-sm text-amber-900">
          <input
            aria-label="Acknowledge pending purchases"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1"
          />
          <span>
            This change affects {affected} pending purchase{affected === 1 ? '' : 's'}. They will be
            re-checked when you approve or decline them.
          </span>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900"
        >
          Save rule
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
