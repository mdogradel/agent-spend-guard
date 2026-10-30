'use client'

import { SimulatorForm } from '@/components/SimulatorForm'

export default function SimulatorPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Simulator</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Simulate an agent purchase. Hotel Lisbon is priced in EUR and its checkout is one day later
          than the intent, so the receipt shows an intent mismatch.
        </p>
      </header>
      <SimulatorForm />
    </div>
  )
}
