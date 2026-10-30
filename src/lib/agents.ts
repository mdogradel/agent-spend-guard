import type { IntentReceipt } from '@/types'

export const UNKNOWN_AGENT = 'Unknown agent'

/** Stored purchases use agentName. Blank or missing names stay readable. */
export function agentLabel(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed : UNKNOWN_AGENT
}

export interface AgentSpendSummary {
  name: string
  count: number
  totalUsd: number
  lastAt: string
}

export function summarizeByAgent(receipts: IntentReceipt[]): AgentSpendSummary[] {
  const byName = new Map<string, AgentSpendSummary>()

  for (const receipt of receipts) {
    const name = agentLabel(receipt.purchaseRequest?.agentName)
    const usd = receipt.usdEquivalentAmount ?? 0
    const at = receipt.purchaseRequest?.submittedAt ?? receipt.createdAt
    const current = byName.get(name)
    if (!current) {
      byName.set(name, { name, count: 1, totalUsd: usd, lastAt: at })
      continue
    }
    current.count += 1
    current.totalUsd += usd
    if (at > current.lastAt) current.lastAt = at
  }

  return [...byName.values()].sort((left, right) => right.lastAt.localeCompare(left.lastAt))
}
