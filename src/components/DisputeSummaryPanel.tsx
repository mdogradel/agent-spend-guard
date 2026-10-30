'use client'

import { useState } from 'react'
import { generateDisputeSummary } from '@/lib/dispute-generator'
import type { IntentReceipt } from '@/types'

export function DisputeSummaryPanel({ receipt }: { receipt: IntentReceipt }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState(false)

  async function onDispute() {
    const text = generateDisputeSummary(receipt)
    setSummary(text)
    setCopied(false)
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable')
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setFallback(false)
    } catch {
      setCopied(false)
      setFallback(true)
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">Dispute summary</h2>
      <p className="mt-1 text-sm text-stone-600">
        Plain text you can send to a bank or card issuer.
      </p>
      <button
        type="button"
        onClick={onDispute}
        data-testid="dispute-button"
        className="mt-3 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        Dispute
      </button>
      {copied ? <p className="mt-2 text-sm text-teal-800">Copied to the clipboard.</p> : null}
      {fallback && summary ? (
        <textarea
          aria-label="Dispute summary"
          data-testid="dispute-text"
          readOnly
          value={summary}
          rows={16}
          className="mt-3 w-full rounded-lg border border-stone-300 p-3 font-mono text-xs"
        />
      ) : null}
      {summary && !fallback ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-800">
          {summary}
        </pre>
      ) : null}
    </section>
  )
}
