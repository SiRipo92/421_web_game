import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// `package.json` declares `"type": "module"`, so __dirname doesn't exist —
// derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * G99 — Playwright E2E suite.
 *
 * Boots both the FastAPI backend (uvicorn on :8421) and the Vite dev server
 * (on :5173) as webServers. Vite already proxies /api, /auth, /ws to
 * localhost:8421, so the React app under test talks to the real backend.
 *
 * **Secrets:** The backend needs a real `DATABASE_URL` (containing the
 * Postgres password). We load it from the repo-root `.env` file via
 * dotenv — never hardcoded in this file. The `.env` file is gitignored;
 * see `.env.example` for the expected keys.
 *
 * Required env vars (set in `.env`):
 *   - TEST_DATABASE_URL — Postgres URL for the test DB. Playwright reuses
 *     the same DB the backend pytest suite uses (`fourtwentyone_test`)
 *     because runs are sequential. To use a dedicated DB, set
 *     E2E_DATABASE_URL to override.
 *   - SECRET_KEY — JWT signing key (any value works in dev).
 *
 * Why this layout:
 *   - `webServer: [...]` (array of two) lets Playwright wait on both ports
 *     before running tests.
 *   - `reuseExistingServer` lets a dev (running both servers manually) skip
 *     the boot wait. CI sets CI=1 so it always starts fresh.
 *
 * Run locally:
 *   cd frontend && npx playwright test
 * Single spec:
 *   npx playwright test tests/e2e/auth.spec.ts
 * Debug:
 *   npx playwright test --headed --debug
 */

// Load the repo-root .env so backend env vars (DATABASE_URL etc.) are
// available when Playwright spawns the uvicorn webServer.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const dbUrl =
  process.env.E2E_DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  // CI provides DATABASE_URL directly via the GHA `env:` block, so a
  // missing .env in CI is fine — we'll fall through to that.
  process.env.DATABASE_URL ||
  ''

if (!dbUrl) {
  // Fail fast with a clear message rather than silently launching uvicorn
  // against the dev DB.
  throw new Error(
    'No database URL configured. Set TEST_DATABASE_URL (or E2E_DATABASE_URL) ' +
      'in repo-root .env, or DATABASE_URL in the environment for CI.',
  )
}

const secretKey = process.env.SECRET_KEY || 'dev-only-secret-for-playwright'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // Multi-player specs need to spin up two contexts in the same room; running
  // serially avoids race-ish collisions on the shared game-code namespace.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Backend — DATABASE_URL is injected via env, never templated into the
      // command string (which would leak into Playwright's stdout logs).
      command: 'cd .. && PYTHONPATH=. .venv/bin/uvicorn app.main:app --port 8421 --host 127.0.0.1',
      env: {
        DATABASE_URL: dbUrl,
        SECRET_KEY: secretKey,
        // Force DEBUG=true so the test conftest's deliverability bypass +
        // helpful error messages are active.
        DEBUG: 'true',
      },
      url: 'http://localhost:8421/healthz',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Frontend
      command: 'npm run dev -- --port 5173 --host 127.0.0.1',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
