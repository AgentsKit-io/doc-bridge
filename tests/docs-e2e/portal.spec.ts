import { expect, test } from '@playwright/test'

test('landing communicates the deterministic proof and has no horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('duplicated truth')
  await expect(page.getByText('backend calls: 0')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Run the 60-second proof' })).toHaveAttribute('href', /\/docs\/getting-started\/?$/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.locator('.ecosystem-bar a')).toHaveCount(8)
  await expect(page.locator('.ecosystem-peer')).toHaveCount(6)
})

test('Fumadocs renders canonical docs with raw and llms surfaces', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.locator('h1#getting-started')).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'config-v1' })).toHaveAttribute('href', '/docs/spec/config-v1/')
  const raw = page.getByRole('link', { name: 'View raw Markdown' })
  await expect(raw).toHaveAttribute('href', '/raw/getting-started.md')
  const llms = await page.request.get('/llms.txt')
  expect(llms.ok()).toBeTruthy()
  expect(await llms.text()).toContain('# AgentsKit Doc Bridge')
  await expect(page.locator('.ecosystem-peer')).toHaveCount(6)
})

test('agent-first and machine surfaces are public and cross-linked', async ({ page }) => {
  await page.goto('/for-agents')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Resolve context')
  await expect(page.getByRole('link', { name: 'llms.txt' })).toHaveAttribute('href', '/llms.txt')
  for (const path of ['/llms.txt', '/llms-full.txt', '/raw/for-agents.md', '/deterministic/knowledge.json']) {
    expect((await page.request.get(path)).ok(), path).toBeTruthy()
  }
})

for (const width of [375, 768, 1280, 1440]) {
  test(`landing and docs do not overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/docs/getting-started', '/for-agents']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      if (path === '/') {
        const linksFit = await page.locator('.ecosystem-links a').evaluateAll((links) => links.every((link) => {
          const box = link.getBoundingClientRect()
          return box.left >= 0 && box.right <= document.documentElement.clientWidth
        }))
        expect(linksFit, `all ecosystem links visible at ${width}px`).toBeTruthy()
      }
    }
  })
}

test('known and ambiguous questions stay local', async ({ page }) => {
  const backendRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/v1/ask')) backendRequests.push(request.url()) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask Doc Bridge' }).click()
  const input = page.getByPlaceholder('Ask about setup, MCP, gates, or ownership…')
  await input.fill('doc-bridge')
  await input.press('Enter')
  await expect(page.getByText("This answer was generated from the repository's own Doc Bridge index.")).toBeVisible()
  await expect(page.locator('[data-answer-path="local"]')).toBeVisible()
  expect(backendRequests).toHaveLength(0)

  await input.fill('getting-started')
  await input.press('Enter')
  await expect(page.getByText('Install, index, query, and gate repository documentation in about 60 seconds.')).toBeVisible()
  expect(backendRequests).toHaveLength(0)

  await input.fill('mcp')
  await input.press('Enter')
  await expect(page.getByRole('group', { name: 'More than one exact local answer matches. Choose one to continue.' })).toBeVisible()
  expect(backendRequests).toHaveLength(0)
})

test('local discovery retries a transient first-load failure and covers module handoffs', async ({ page }) => {
  let artifactRequests = 0
  const backendRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/v1/ask')) backendRequests.push(request.url()) })
  await page.route('**/deterministic/knowledge.json', async (route) => {
    artifactRequests += 1
    if (artifactRequests === 1) await route.fulfill({ status: 503, body: 'transient' })
    else await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask Doc Bridge' }).click()
  const input = page.getByPlaceholder('Ask about setup, MCP, gates, or ownership…')
  await input.fill('doc-bridge-cli')
  await input.press('Enter')
  await expect(page.getByText('Public ak-docs commands, arguments, output modes, and bundled demo.')).toBeVisible()
  await expect(page.locator('[data-answer-path="local"]')).toBeVisible()
  expect(artifactRequests).toBe(2)
  expect(backendRequests).toHaveLength(0)
})

test('a real miss calls the backend and only marks success after a completed stream', async ({ page }) => {
  let calls = 0
  await page.route('**/v1/ask?**', async (route) => {
    calls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: '{"type":"text","delta":"Backend synthesis with repository context."}\n{"type":"done","model":"e2e"}\n',
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ask Doc Bridge' }).click()
  const input = page.getByPlaceholder('Ask about setup, MCP, gates, or ownership…')
  await expect(input).toBeVisible()
  await input.fill('How should I restructure an undocumented private deployment?')
  await input.press('Enter')
  await expect(page.getByText('Backend synthesis with repository context.')).toBeVisible()
  await expect(page.locator('[data-answer-path="backend"]')).toBeVisible()
  expect(calls).toBe(1)
})
