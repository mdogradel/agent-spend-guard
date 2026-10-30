import { expect, test, type Page } from '@playwright/test'

async function submitHotelLisbon(page: Page) {
  await page.route('https://api.frankfurter.dev/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        amount: 1,
        base: 'EUR',
        date: '2026-10-30',
        rates: { USD: 1.1 },
      }),
    })
  })

  await page.goto('/simulator')
  await page.getByLabel('Preset').selectOption('hotel-lisbon')
  await page.getByRole('button', { name: 'Submit purchase' }).click()
  await expect(page.getByTestId('decision-result')).toContainText('2026-11-15')
  await page.getByTestId('view-receipt').click()
  await expect(page.getByTestId('dispute-button')).toBeVisible()
}

test('copies the Hotel Lisbon dispute summary', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { __clipboardText?: string }).__clipboardText = text
        },
      },
    })
  })

  await submitHotelLisbon(page)
  await page.getByTestId('dispute-button').click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __clipboardText?: string }).__clipboardText ?? '',
      ),
    )
    .toContain('date_mismatch')
})

test('shows the dispute text when the clipboard is unavailable', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
  })

  await submitHotelLisbon(page)
  await page.getByTestId('dispute-button').click()
  const summary = page.getByLabel('Dispute summary')
  await expect(summary).toBeVisible()
  await expect(summary).toHaveValue(/date_mismatch/)
})
