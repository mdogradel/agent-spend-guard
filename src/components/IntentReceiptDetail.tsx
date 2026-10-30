import { agentLabel } from '@/lib/agents'
import { describeRateSource } from '@/lib/fx-service'
import { formatMoney, formatUSD, formatWhen } from '@/lib/format'
import { StatusBadge } from '@/components/StatusBadge'
import type { IntentReceipt } from '@/types'

export function IntentReceiptDetail({ receipt }: { receipt: IntentReceipt }) {
  const purchase = receipt.purchaseRequest
  const intent = purchase.structuredIntent
  const foreign = purchase.currency.trim().toUpperCase() !== 'USD'

  return (
    <article className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-teal-800">{agentLabel(purchase.agentName)}</p>
          <h1 className="text-2xl font-semibold text-stone-900">{purchase.merchantName}</h1>
          <p className="text-sm text-stone-600">{purchase.category}</p>
        </div>
        <StatusBadge status={receipt.status} />
      </header>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-stone-500">Amount</span>
          <span className="font-medium">{formatMoney(purchase.amount, purchase.currency)}</span>
        </p>
        <p>
          <span className="block text-stone-500">USD equivalent</span>
          <span className="font-medium">
            {receipt.usdEquivalentAmount == null ? 'Unavailable' : formatUSD(receipt.usdEquivalentAmount)}
          </span>
        </p>
        <p>
          <span className="block text-stone-500">Submitted</span>
          <span className="font-medium">{formatWhen(purchase.submittedAt)}</span>
        </p>
        {foreign && receipt.fxRate ? (
          <p>
            <span className="block text-stone-500">Exchange rate</span>
            <span className="font-medium">
              1 {receipt.fxRate.fromCurrency} = {receipt.fxRate.rate.toFixed(6)} USD
            </span>
            <span className="mt-1 block text-stone-600" data-testid="fx-source">
              {describeRateSource(receipt.fxRate)}
            </span>
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-stone-900">Intent</h2>
        <p className="mt-1 text-sm text-stone-700">
          {purchase.intentText?.trim() || 'No instruction provided'}
        </p>
        <dl className="mt-2 grid gap-1 text-sm text-stone-600">
          {intent?.maxBudgetAmount != null ? (
            <div>
              Max budget: {intent.maxBudgetAmount} {intent.budgetCurrency ?? ''}
            </div>
          ) : null}
          {intent?.travelDates && intent.travelDates.length > 0 ? (
            <div>Intent dates: {intent.travelDates.join(', ')}</div>
          ) : null}
          {intent?.intendedCategory ? <div>Intended category: {intent.intendedCategory}</div> : null}
          {purchase.travelDates && purchase.travelDates.length > 0 ? (
            <div>Purchase dates: {purchase.travelDates.join(', ')}</div>
          ) : null}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-stone-900">Decision</h2>
        <p className="mt-1 text-sm text-stone-700">
          {receipt.decision.outcome}
          {receipt.decision.explanation ? `: ${receipt.decision.explanation}` : ''}
        </p>
        {receipt.decision.failures.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-stone-700">
            {receipt.decision.failures.map((failure) => (
              <li key={`${failure.ruleType}-${failure.explanation}`}>{failure.explanation}</li>
            ))}
          </ul>
        ) : null}
        {receipt.overrideLog ? (
          <p className="mt-2 text-sm text-amber-900">
            Override: {receipt.overrideLog.overageDetail} at {formatWhen(receipt.overrideLog.overriddenAt)}
          </p>
        ) : null}
        {receipt.priceCheckSkipped ? (
          <p className="mt-2 text-sm text-stone-500">
            {receipt.priceCheckSkipReason ?? 'price check skipped, no rate'}
          </p>
        ) : null}
      </section>

      {receipt.mismatches.length > 0 ? (
        <section data-testid="mismatch-section">
          <h2 className="text-sm font-semibold text-stone-900">Mismatches</h2>
          <ul className="mt-2 space-y-1 text-sm text-orange-900">
            {receipt.mismatches.map((flag) => (
              <li key={flag.type}>
                <span className="font-medium">{flag.type}: </span>
                {flag.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
