import { defineConfig, devices } from '@playwright/test'

const port = Number.parseInt(process.env.E2E_PORT ?? '4199', 10)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `NODE_ENV=test HOSTNAME=127.0.0.1 PORT=${port} DATABASE_URL=${process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL} ALLOWED_ORIGINS=${baseURL} npx tsx server.ts`,
    url: `${baseURL}/ko`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
