import { test, expect } from '@playwright/test'

test.describe('auth flow', () => {
  test('unauthenticated visit to / redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible()
  })

  test('signup page shows invitation-only message', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByText(/invitation-only/i)).toBeVisible()
  })

  test('login form rejects empty submission', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /Sign in/i }).click()
    await expect(page.getByText(/Enter a valid email/i)).toBeVisible()
  })

  test('login with seeded owner credentials reaches the dashboard', async ({ page }) => {
    const email = process.env.OWNER_EMAIL
    const password = process.env.OWNER_PASSWORD
    test.skip(!email || !password, 'OWNER_EMAIL and OWNER_PASSWORD must be set in the test env')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: /Sign in/i }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'CXAllies' })).toBeVisible()
  })
})
