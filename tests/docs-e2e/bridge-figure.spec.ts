import { expect, test } from '@playwright/test'

test('home page renders the bridge figure with a lazy iframe and both static fallbacks', async ({ page }) => {
  await page.goto('/')
  const figure = page.locator('#how .bridge-figure')
  const frame = figure.locator('iframe.bridge-figure-frame')
  await expect(frame).not.toHaveAttribute('src', /.+/)
  await frame.scrollIntoViewIfNeeded()
  await expect(frame).toHaveAttribute('src', '/figures/bridge-conveyor.html')
  await expect(frame).toHaveAttribute('loading', 'lazy')
  await expect(frame).toHaveAttribute('title', /.+/)
  await expect(figure.locator('picture source')).toHaveAttribute('srcset', '/figures/bridge-conveyor-fallback-light.png')
  await expect(figure.locator('picture img')).toHaveAttribute('src', '/figures/bridge-conveyor-fallback-dark.png')
  await expect(figure.locator('picture img')).toHaveAttribute('width', '2552')
  await expect(figure.locator('picture img')).toHaveAttribute('height', '1234')
})
