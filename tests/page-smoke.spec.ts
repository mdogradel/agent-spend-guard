import { expect, test } from '@playwright/test'

const ROUTES = ['/', '/dashboard', '/rules', '/simulator', '/inbox', '/receipts'] as const

test('fresh visit to each main route does not throw', async ({ browser }) => {
  test.setTimeout(60_000)
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(`${page.url()} ${error.message}`)
  })

  try {
    for (const path of ROUTES) {
      await page.goto(path)
      expect(errors, errors.join('\n')).toEqual([])
      await expect(page.getByRole('banner')).toBeVisible()
    }
  } finally {
    await context.close()
  }
})
