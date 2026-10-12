import { expect, test } from '@playwright/test'

test('home page renders the assembly figure with a lazy iframe and a static fallback', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#assembly-figure')
  await expect(section).toBeVisible()
  await expect(section.getByRole('heading', { level: 2 })).toBeVisible()

  const frame = section.locator('iframe.bridge-assembly-frame')
  await expect(frame).toHaveAttribute('src', '/figures/assembly-line.html')
  await expect(frame).toHaveAttribute('loading', 'lazy')
  await expect(frame).toHaveAttribute('title', /interactive/i)

  await expect(frame).toBeVisible()
  await expect(section.locator('picture')).toHaveCount(0)
})

test('the figure inside the iframe raises the advisory when the change is toggled', async ({ page }) => {
  await page.goto('/')
  const figure = page.frameLocator('#assembly-figure iframe')
  await figure.locator('#toggle').click()
  await expect(figure.locator('#r-findings')).toContainText('1 advisory', { timeout: 15_000 })
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the interactive figure stays visible and usable', async ({ page }) => {
    await page.goto('/')
    const frame = page.locator('#assembly-figure iframe.bridge-assembly-frame')
    await expect(frame).toBeVisible()
    const figure = page.frameLocator('#assembly-figure iframe')
    await figure.locator('#toggle').click()
    await expect(figure.locator('#r-findings')).toContainText('1 advisory', { timeout: 15_000 })
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the static dark capture replaces the iframe', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#assembly-figure')
    const fallback = section.locator('img.bridge-assembly-static')
    await expect(fallback).toBeVisible()
    await expect(fallback).toHaveAttribute('src', '/figures/assembly-line-fallback-dark.png')
    await expect(fallback).toHaveAttribute('alt', /.+/)
    await expect(section.locator('iframe.bridge-assembly-frame')).toBeHidden()
  })
})
