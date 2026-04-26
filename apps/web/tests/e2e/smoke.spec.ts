import { test, expect } from '@playwright/test'

test('homepage renders headline', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CXAllies' })).toBeVisible()
})
