import { test, expect } from '@playwright/test'

// Pre-auth smoke: hitting / must always at least serve the public login page
// (since the homepage now lives under (authed)/ and redirects when no session).
test('unauthenticated / redirects to /login and renders the sign-in form', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible()
})

// Post-auth smoke: env-gated to match login.spec.ts. With OWNER_EMAIL/PASSWORD
// set, sign in and confirm the Dashboard renders.
test('authenticated owner sees the Dashboard heading', async ({ page }) => {
  const email = process.env.OWNER_EMAIL
  const password = process.env.OWNER_PASSWORD
  test.skip(!email || !password, 'OWNER_EMAIL and OWNER_PASSWORD must be set in the test env')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: /Sign in/i }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
