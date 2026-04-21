import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  return errors
}

async function expectSceneMounted(page: Page): Promise<void> {
  await expect(page.locator('#scene-root')).toBeVisible()
  const canvas = page.locator('canvas[data-scene-canvas="true"]')
  await expect(canvas).toHaveCount(1, { timeout: 15_000 })
  await expect
    .poll(async () => canvas.evaluate((node) => (node as HTMLCanvasElement).width))
    .toBeGreaterThan(0)
  await expect
    .poll(async () => canvas.evaluate((node) => (node as HTMLCanvasElement).height))
    .toBeGreaterThan(0)
}

test.describe('localized memorial scene', () => {
  test('mounts MemorialScene and transitions between supported locales', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/ko')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    await expectSceneMounted(page)

    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expectSceneMounted(page)

    expect(errors).toEqual([])
  })
})
