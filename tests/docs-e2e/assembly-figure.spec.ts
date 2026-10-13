import { expect, test } from '@playwright/test'

test('home page renders the assembly figure with a lazy iframe and a static fallback', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#assembly-figure')
  await expect(section).toBeVisible()
  await expect(section.getByRole('heading', { level: 2 })).toBeVisible()

  const frame = section.locator('iframe.bridge-assembly-frame')
  // The figure loads only when its section nears the viewport, never during the hero's first paint.
  await expect(frame).not.toHaveAttribute('src', /.+/)
  await frame.scrollIntoViewIfNeeded()
  await expect(frame).toHaveAttribute('src', '/figures/assembly-line.html')
  await expect(frame).toHaveAttribute('loading', 'lazy')
  await expect(frame).toHaveAttribute('title', /interactive/i)

  await expect(frame).toBeVisible()
  await expect(section.locator('picture')).toHaveCount(0)
})

test('the figure inside the iframe raises the advisory when the change is toggled', async ({ page }) => {
  await page.goto('/')
  await page.locator('#assembly-figure iframe').scrollIntoViewIfNeeded()
  const figure = page.frameLocator('#assembly-figure iframe')
  await expect(figure.locator('#r-findings')).toHaveText('0', { timeout: 15_000 })
  await figure.locator('#toggle').click()
  await expect(figure.locator('#toggle')).toHaveAttribute('aria-pressed', 'true')
  // The changed file has to travel the line: loom, then the gate, then the stamp.
  await expect(figure.locator('#r-findings')).toContainText('1 advisory', { timeout: 30_000 })
  await expect(figure.locator('#slip')).toContainText('region fix', { timeout: 30_000 })
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the interactive figure stays visible and usable', async ({ page }) => {
    await page.goto('/')
    const frame = page.locator('#assembly-figure iframe.bridge-assembly-frame')
    await expect(frame).toBeVisible()
    await frame.scrollIntoViewIfNeeded()
    const figure = page.frameLocator('#assembly-figure iframe')
    await figure.locator('#toggle').click()
    // Reduced motion applies the change at once: no belt travel to wait for.
    await expect(figure.locator('#r-findings')).toContainText('1 advisory', { timeout: 5_000 })
    await expect(figure.locator('#slip')).toBeVisible()
    await figure.locator('#toggle').click()
    await expect(figure.locator('#r-findings')).toHaveText('0')
    await expect(figure.locator('#slip')).toBeHidden()
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the static capture replaces the iframe', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#assembly-figure')
    const fallback = section.locator('img.bridge-assembly-static')
    await expect(fallback).toBeVisible()
    await expect(fallback).toHaveAttribute('src', '/figures/assembly-line-fallback-dark.png')
    await expect(fallback).toHaveAttribute('alt', /.+/)
    await expect(section.locator('picture source')).toHaveAttribute('srcset', '/figures/assembly-line-fallback-light.png')
    await expect(section.locator('iframe.bridge-assembly-frame')).toBeHidden()
  })
})

test.describe('on a phone-width viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the figure page does not scroll sideways and opens at the intake', async ({ page }) => {
    await page.goto('/figures/assembly-line.html')
    await expect(page.locator('#r-findings')).toHaveText('0', { timeout: 15_000 })
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client)
    // The drawing is wider than the card on a phone; the first view starts at the left (intake) end.
    const transform = await page.locator('.al-scroll .iso-svg').evaluate((svg) => (svg as SVGElement).style.transform)
    expect(transform).toMatch(/^translate\(0px, -?\d+px\)$/)
    // The stage is cropped to the first view, so it is shorter than the whole drawing and holds no empty band.
    const heights = await page.evaluate(() => ({
      stage: document.querySelector('.al-scroll')!.getBoundingClientRect().height,
      drawing: document.querySelector('.al-scroll .iso-svg')!.getBoundingClientRect().height,
    }))
    expect(heights.stage).toBeLessThan(heights.drawing * 0.85)
  })
})
