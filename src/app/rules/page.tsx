'use client'

import { useState } from 'react'
import { RuleForm } from '@/components/RuleForm'
import { formatUSD } from '@/lib/format'
import { useSpendGuardStore } from '@/store/useSpendGuardStore'
import type { SpendingRule } from '@/types'

function sampleRules(now: string): SpendingRule[] {
  return [
    {
      id: crypto.randomUUID(),
      type: 'category_limit',
      category: 'Dining',
      limitAmountUSD: 300,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      type: 'category_limit',
      category: 'Travel',
      limitAmountUSD: 2000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      type: 'category_limit',
      category: 'Groceries',
      limitAmountUSD: 500,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      type: 'approval_threshold',
      thresholdAmountUSD: 50,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      type: 'blocked_category',
      category: 'Gambling',
      createdAt: now,
    },
  ]
}

export default function RulesPage() {
  const rules = useSpendGuardStore((state) => state.rules)
  const deleteRule = useSpendGuardStore((state) => state.deleteRule)
  const addRule = useSpendGuardStore((state) => state.addRule)
  const [mode, setMode] = useState<SpendingRule | 'new' | null>(null)

  const rows: { id: string; label: string; detail: string; rule: SpendingRule }[] = [
    ...rules.categoryLimits.map((rule) => ({
      id: rule.id,
      label: rule.category,
      detail: `${formatUSD(rule.limitAmountUSD)} monthly category limit`,
      rule,
    })),
    ...rules.merchantLimits.map((rule) => ({
      id: rule.id,
      label: rule.merchant,
      detail: `${formatUSD(rule.limitAmountUSD)} monthly merchant limit`,
      rule,
    })),
    ...(rules.approvalThreshold
      ? [
          {
            id: rules.approvalThreshold.id,
            label: 'Approval threshold',
            detail: `Anything over ${formatUSD(rules.approvalThreshold.thresholdAmountUSD)} needs approval`,
            rule: rules.approvalThreshold,
          },
        ]
      : []),
    ...rules.blockedCategories.map((rule) => ({
      id: rule.id,
      label: rule.category,
      detail: 'Blocked category',
      rule,
    })),
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Rules</h1>
          <p className="mt-1 text-sm text-stone-600">Your rules and limits</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date().toISOString()
              for (const rule of sampleRules(now)) addRule(rule)
            }}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 hover:bg-white"
          >
            Load sample rules
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900"
          >
            Add rule
          </button>
        </div>
      </header>

      {mode === 'new' ? (
        <RuleForm onCancel={() => setMode(null)} onSaved={() => setMode(null)} />
      ) : null}
      {mode && mode !== 'new' ? (
        <RuleForm initial={mode} onCancel={() => setMode(null)} onSaved={() => setMode(null)} />
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
          No rules yet. Add one, or load the sample set to try the simulator.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-stone-900">{row.label}</p>
                <p className="text-stone-500">{row.detail}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode(row.rule)}
                  className="rounded-md px-2 py-1 text-teal-800 hover:bg-teal-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteRule(row.id)}
                  className="rounded-md px-2 py-1 text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
