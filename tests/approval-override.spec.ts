import { expect, test } from '@playwright/test'

test('approve with overage can be overridden once', async ({ page }) => {
  test.setTimeout(60_000)

  await page.goto('/rules')
  await page.getByRole('button', { name: 'Add rule' }).click()
  await page.getByLabel('Rule type').selectOption('category_limit')
  await page.getByLabel('Category').fill('Dining')
  await page.getByLabel('Amount').fill('5')
  await page.getByRole('button', { name: 'Save rule' }).click()
  await expect(page.getByText('$5.00 monthly category limit')).toBeVisible()

  await page.goto('/simulator')
  await page.getByLabel('Preset').selectOption('coffee-shop')
  await page.getByRole('button', { name: 'Submit purchase' }).click()
  await expect(page.getByTestId('decision-result')).toContainText('needs_approval')
  const receiptHref = await page.getByTestId('view-receipt').getAttribute('href')
  expect(receiptHref).toBeTruthy()

  await page.goto('/inbox')
  await page.getByRole('button', { name: 'Approve' }).click()
  const modal = page.getByTestId('overage-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(
    'Approving this puts Dining $3.50 over the $5.00 monthly limit',
  )
  await page.getByRole('button', { name: 'Override Once' }).click()
  await expect(page.getByTestId('purchase-card')).toHaveCount(0)

  await page.goto(receiptHref!)
  await expect(page.getByText('Approving this puts Dining $3.50 over the $5.00 monthly limit')).toBeVisible()
})
