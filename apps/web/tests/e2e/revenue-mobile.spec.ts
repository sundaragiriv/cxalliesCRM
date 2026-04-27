import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
})

test.describe('revenue flow (mobile)', () => {
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    'Requires OWNER_EMAIL and OWNER_PASSWORD',
  )

  test('owner records revenue, sees the auto-posted journal entry, edits with correction, and deletes', async ({ page }) => {
    test.setTimeout(180_000)

    const email = process.env.OWNER_EMAIL!
    const password = process.env.OWNER_PASSWORD!
    const description = `May consulting ${Date.now()}`

    // Login
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /Sign in/i }).click()
    await expect(page).toHaveURL('/', { timeout: 30_000 })

    // New revenue
    await page.goto('/finance/revenue/new')
    await expect(page.getByRole('heading', { name: /New revenue/i })).toBeVisible({
      timeout: 30_000,
    })

    // Wait for picker data — once a known business line label is rendered,
    // the form's defaults have been applied by useEffect.
    await expect(page.getByText(/SAP\/AI Consulting/i).first()).toBeVisible({
      timeout: 30_000,
    })

    await page.getByLabel(/Amount/i).fill('1500.00')
    await page.getByLabel('Description').fill(description)

    await page.getByRole('button', { name: /Save revenue/i }).click()

    // Detail page shows the amount and the journal entry
    await expect(page.locator('h1')).toContainText('$1,500.00', { timeout: 30_000 })
    await expect(page.getByText(description).first()).toBeVisible()
    // The detail view renders the auto-posted journal entry with its number
    await expect(page.getByText(/JE-\d{4}-\d{4}/)).toBeVisible({ timeout: 15_000 })

    // Edit with a material change (amount) → expect correction warning
    await page.getByRole('button', { name: /Edit/i }).click()
    await expect(page.getByRole('heading', { name: /Edit revenue/i })).toBeVisible()
    await page.getByLabel(/Amount/i).fill('2000.00')
    await expect(page.getByText(/correction entry in the journal/i)).toBeVisible()
    await page.getByRole('button', { name: /Update revenue/i }).click()
    await expect(page.locator('h1')).toContainText('$2,000.00', { timeout: 30_000 })

    // Detail view should now show 3 journal entries: original + reversal + new.
    // We just assert the "Reversal" badge is present.
    await expect(page.getByText(/Reversal/i).first()).toBeVisible({ timeout: 15_000 })

    // Delete (auto-accept the confirm dialog)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await expect(page).toHaveURL(/\/finance\/revenue$/, { timeout: 30_000 })
    await expect(page.getByText(description)).toHaveCount(0, { timeout: 30_000 })
  })
})
