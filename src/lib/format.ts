import { formatUSD } from '@/lib/rules-engine'

export { formatUSD }

/** Format an amount in its own currency. Falls back to "123.00 EUR" for unknown codes. */
export function formatMoney(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
