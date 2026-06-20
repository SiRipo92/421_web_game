/**
 * G99 — Playwright E2E: register + login flow.
 *
 * Critical journey #1 from the roadmap. Verifies that a brand-new visitor
 * can register, gets a JWT, and is redirected into the authenticated area.
 *
 * Each test mints a fresh unique email + username so reruns don't collide
 * with each other (no test-DB-reset hook from inside Playwright).
 */
import { test, expect } from '@playwright/test'

function uniqueUser() {
  const suffix = Math.random().toString(36).slice(2, 10)
  // E2E uses @gmail.com because the production deliverability check (DNS
  // MX lookup) rejects @example.com — that's an intentional null-MX
  // domain that says "do not send mail here." The backend test suite
  // bypasses the check via a conftest monkeypatch; Playwright doesn't
  // get that fixture, so we pick a domain with a real MX. The address
  // never receives mail because the user never opts in to email.
  return {
    username: `pw_${suffix}`,
    email: `pw_${suffix}@gmail.com`,
    password: 'Playwright1!',
    birthdate: '1990-06-15',
  }
}

test.describe('Auth — register + login', () => {
  test('a new visitor can register and is logged in', async ({ page }) => {
    const u = uniqueUser()

    await page.goto('/login')
    await page.getByTestId('switch-to-register').click()

    await page.locator('#reg-username').fill(u.username)
    await page.locator('#reg-email').fill(u.email)
    await page.locator('#reg-password').fill(u.password)
    await page.locator('#reg-confirm-password').fill(u.password)
    await page.locator('#reg-birthdate').fill(u.birthdate)
    await page.locator('#accept-cgu').check()
    await page.getByTestId('register-submit').click()

    // Authenticated landing: the home / lobby should be reachable.
    // We don't assert a specific URL because welcome-flow routing might
    // detour via /complete-profile depending on Google SSO state, etc.
    // Instead assert the JWT token is in localStorage — the auth contract.
    await expect.poll(
      async () => await page.evaluate(() => localStorage.getItem('token')),
      { timeout: 10_000 },
    ).not.toBeNull()
  })

  test('a registered user can log out and back in', async ({ page }) => {
    const u = uniqueUser()

    // Register first
    await page.goto('/login')
    await page.getByTestId('switch-to-register').click()
    await page.locator('#reg-username').fill(u.username)
    await page.locator('#reg-email').fill(u.email)
    await page.locator('#reg-password').fill(u.password)
    await page.locator('#reg-confirm-password').fill(u.password)
    await page.locator('#reg-birthdate').fill(u.birthdate)
    await page.locator('#accept-cgu').check()
    await page.getByTestId('register-submit').click()
    await expect.poll(async () => await page.evaluate(() => localStorage.getItem('token')), {
      timeout: 10_000,
    }).not.toBeNull()

    // Log out: clear the token + navigate back to /login.
    await page.evaluate(() => localStorage.removeItem('token'))
    await page.goto('/login')

    // Log in with the same creds
    await page.locator('#login-email').fill(u.email)
    await page.locator('#login-password').fill(u.password)
    await page.getByTestId('login-submit').click()

    // A fresh JWT should land in localStorage.
    await expect.poll(async () => await page.evaluate(() => localStorage.getItem('token')), {
      timeout: 10_000,
    }).not.toBeNull()
  })

  test('login with wrong password shows an error', async ({ page }) => {
    const u = uniqueUser()

    await page.goto('/login')
    await page.getByTestId('switch-to-register').click()
    await page.locator('#reg-username').fill(u.username)
    await page.locator('#reg-email').fill(u.email)
    await page.locator('#reg-password').fill(u.password)
    await page.locator('#reg-confirm-password').fill(u.password)
    await page.locator('#reg-birthdate').fill(u.birthdate)
    await page.locator('#accept-cgu').check()
    await page.getByTestId('register-submit').click()
    await page.evaluate(() => localStorage.removeItem('token'))
    await page.goto('/login')

    await page.locator('#login-email').fill(u.email)
    await page.locator('#login-password').fill('WrongPassword1!')
    await page.getByTestId('login-submit').click()

    // The error renders as <p role="alert"> by the form; FR renders
    // "Identifiants incorrects.", EN "Invalid email or password."
    // Use .first() because there may be duplicate alert markup from the
    // toggle history.
    await expect(
      page.getByRole('alert').filter({ hasText: /invalid|incorrect|invalide|mauvais/i }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })
})
