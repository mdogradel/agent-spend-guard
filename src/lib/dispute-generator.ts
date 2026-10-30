import type { IntentReceipt } from '@/types'

/** Dispute is offered only when the receipt has at least one mismatch flag. */
export function shouldShowDisputeButton(receipt: Pick<IntentReceipt, 'mismatches'>): boolean {
  return receipt.mismatches.length > 0
}

/**
 * Plain-text dispute summary. No HTML. The exchange-rate section and the
 * override line are included only when the receipt has them.
 */
export function generateDisputeSummary(
  receipt: IntentReceipt,
  generatedAt = new Date().toISOString(),
): string {
  const purchase = receipt.purchaseRequest
  const intent = purchase.structuredIntent
  const lines: string[] = [
    'AGENT SPEND GUARD — DISPUTE SUMMARY',
    `Generated: ${generatedAt}`,
    '',
    '--- ORIGINAL INTENT ---',
    `Instruction: ${purchase.intentText?.trim() || 'No instruction provided'}`,
  ]

  if (intent?.maxBudgetAmount != null && Number.isFinite(intent.maxBudgetAmount)) {
    const budgetCurrency = intent.budgetCurrency?.trim()
    lines.push(
      `Max Budget: ${intent.maxBudgetAmount}${budgetCurrency ? ` ${budgetCurrency}` : ''}`,
    )
  }
  if (intent?.travelDates && intent.travelDates.length > 0) {
    lines.push(`Travel Dates: ${intent.travelDates.join(', ')}`)
  }
  if (intent?.intendedCategory?.trim()) {
    lines.push(`Intended Category: ${intent.intendedCategory.trim()}`)
  }

  const currency = purchase.currency.trim().toUpperCase()
  const usdNote =
    currency !== 'USD' && receipt.usdEquivalentAmount != null
      ? ` (${receipt.usdEquivalentAmount} USD)`
      : ''

  lines.push(
    '',
    '--- ACTUAL PURCHASE ---',
    `Agent: ${purchase.agentName}`,
    `Merchant: ${purchase.merchantName}`,
    `Category: ${purchase.category}`,
    `Amount: ${purchase.amount} ${currency}${usdNote}`,
    `Date/Time: ${purchase.submittedAt}`,
    '',
    '--- MISMATCHES ---',
  )

  if (receipt.mismatches.length === 0) {
    lines.push('No mismatches detected.')
  } else {
    for (const mismatch of receipt.mismatches) {
      lines.push(`• ${mismatch.type}: ${mismatch.detail}`)
    }
  }

  lines.push(
    '',
    '--- RULES ENGINE DECISION ---',
    `Outcome: ${receipt.decision.outcome}`,
    `Reason: ${receipt.decision.explanation}`,
  )

  if (receipt.overrideLog) {
    lines.push(
      `Override applied: ${receipt.overrideLog.overageDetail} at ${receipt.overrideLog.overriddenAt}`,
    )
  }

  if (receipt.fxRate) {
    const staleNote = receipt.fxRate.isStale ? ', rate may be stale' : ''
    lines.push(
      '',
      '--- EXCHANGE RATE ---',
      `${receipt.fxRate.fromCurrency}/USD rate: ${receipt.fxRate.rate} (fetched ${receipt.fxRate.fetchedAt}${staleNote})`,
    )
  }

  return lines.join('\n')
}
