import { test, expect } from '@playwright/test'

// Minimal valid PDF (<200 bytes) — Postgres+R2 only care about the bytes;
// the e2e assertion is the upload + presigned-URL round-trip works.
const RECEIPT_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n93\n%%EOF',
  'utf8',
)

// 375px-wide mobile viewport (iPhone SE / mini width) for the 30-second
// on-a-phone target. Chromium-only viewport overrides — no WebKit bundle needed.
test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
})

test.describe('expense flow (mobile)', () => {
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    'Requires OWNER_EMAIL and OWNER_PASSWORD',
  )

  test('owner creates, views, edits, and deletes an expense', async ({ page }) => {
    test.setTimeout(120_000)

    const email = process.env.OWNER_EMAIL!
    const password = process.env.OWNER_PASSWORD!
    const description = `Lunch with client ${Date.now()}`
    const updatedDescription = `${description} (revised)`

    // Login
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /Sign in/i }).click()
    await expect(page).toHaveURL('/', { timeout: 30_000 })

    // Open New expense
    await page.goto('/finance/expenses/new')
    await expect(page.getByRole('heading', { name: /New expense/i })).toBeVisible()

    // Wait for picker data — once the BL select shows a real label, defaults
    // have applied and the form is submittable.
    await expect(page.getByText(/SAP\/AI Consulting/i).first()).toBeVisible({ timeout: 30_000 })

    // Receipt — provide bytes inline so MIME is application/pdf regardless of OS.
    const fileInput = page.locator('input[type="file"][accept*="application/pdf"]').first()
    await fileInput.setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: RECEIPT_PDF,
    })
    // Wait for the upload to settle — the picker swaps to the "attached" pill.
    await expect(page.getByText('receipt.pdf')).toBeVisible({ timeout: 30_000 })

    // Description + amount
    await page.getByLabel('Description').fill(description)
    await page.getByLabel(/Amount/i).fill('42.50')

    // Submit
    await page.getByRole('button', { name: /Save expense/i }).click()

    // Lands on detail page; total visible
    await expect(page.locator('h1')).toContainText('$42.50', { timeout: 30_000 })
    await expect(page.getByText(description)).toBeVisible()

    // Edit
    await page.getByRole('button', { name: /Edit/i }).click()
    await expect(page.getByRole('heading', { name: /Edit expense/i })).toBeVisible()
    await page.getByLabel('Description').fill(updatedDescription)
    await page.getByRole('button', { name: /Update expense/i }).click()
    await expect(page.getByText(updatedDescription)).toBeVisible({ timeout: 30_000 })

    // List view shows the renamed expense — at 375px the mobile-card variant
    // is the visible one (desktop table is in the DOM but hidden at this width).
    await page.goto('/finance/expenses')
    const mobileCardLink = page.getByText(updatedDescription).last()
    await expect(mobileCardLink).toBeVisible({ timeout: 30_000 })

    // Delete (auto-accept the confirm dialog)
    await mobileCardLink.click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: /^Delete$/ }).click()
    await expect(page).toHaveURL(/\/finance\/expenses$/, { timeout: 30_000 })
    // After cache invalidation the deleted expense is gone from both the
    // desktop table and the mobile cards.
    await expect(page.getByText(updatedDescription)).toHaveCount(0, { timeout: 30_000 })
  })
})
