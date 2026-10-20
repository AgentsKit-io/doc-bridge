import { expect, test } from '@playwright/test'

test('home page renders the bridge figure with a lazy iframe and theme still images', async ({ page, isMobile }) => {
  await page.goto('/')
  const figure = page.locator('#how .bridge-figure')
  const frame = figure.locator('iframe.bridge-figure-frame')
  await expect(frame).not.toHaveAttribute('src', /.+/)
  await expect(frame).toHaveAttribute('loading', 'lazy')
  await expect(frame).toHaveAttribute('title', /.+/)
  await expect(figure.locator('img.bridge-figure-static-light')).toHaveAttribute('src', '/figures/bridge-conveyor-fallback-light.png')
  await expect(figure.locator('img.bridge-figure-static-dark')).toHaveAttribute('src', '/figures/bridge-conveyor-fallback-dark.png')
  for (const image of await figure.locator('img').all()) {
    await expect(image).toHaveAttribute('width', '2552')
    await expect(image).toHaveAttribute('height', '1234')
    await expect(image).toHaveAttribute('alt', /.+/)
  }
  await figure.scrollIntoViewIfNeeded()
  if (isMobile) {
    // Phones keep the whole bridge as a still image and never load the interactive page.
    await page.waitForTimeout(500)
    await expect(frame).not.toHaveAttribute('src', /.+/)
    await expect(figure.locator('img:visible')).toHaveCount(1)
  } else {
    await expect(frame).toHaveAttribute('src', '/figures/bridge-conveyor.html')
  }
})

test('the still image follows the site theme, not the OS preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.goto('/')
  const figure = page.locator('#how .bridge-figure')
  await page.setViewportSize({ width: 390, height: 844 })
  await figure.scrollIntoViewIfNeeded()
  await expect(figure.locator('img.bridge-figure-static-dark')).toBeVisible()
  await expect(figure.locator('img.bridge-figure-static-light')).toBeHidden()
})
