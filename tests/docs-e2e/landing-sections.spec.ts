import { expect, test } from '@playwright/test'

test('landing sections are present without separators between them', async ({ page }) => {
  await page.goto('/')
  for (const id of ['how', 'ask', 'finding', 'gate', 'surfaces', 'measured']) {
    const section = page.locator(`#${id}`)
    await expect(section).toBeAttached()
    expect(await section.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('0px')
  }
})

test('the hero and cited-answers terminals type recorded commands', async ({ page }) => {
  await page.goto('/')
  const hero = page.locator('.bridge-hero-terminal')
  await expect(hero.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true')
  await expect(hero.locator('[aria-live] .bridge-term-command')).toContainText('ak-docs ask "How do I send a notification?"', { timeout: 8000 })
  await hero.getByRole('tab', { name: 'Gate' }).click()
  await expect(hero.locator('[aria-live]')).toContainText('Publication blocked:')

  const ask = page.locator('#ask')
  await ask.scrollIntoViewIfNeeded()
  await expect(ask.locator('.bridge-agent-answer')).toHaveAttribute('data-visible', 'true', { timeout: 15000 })
  await expect(ask.locator('.bridge-citation')).toHaveText('docs/guides/sending-notifications.md:8')
})

test('the drift demo walks from the code change to the finding and the fix', async ({ page }) => {
  await page.goto('/')
  const drift = page.locator('#finding')
  await drift.scrollIntoViewIfNeeded()
  await drift.getByRole('tab', { name: 'Code changed' }).click()
  await expect(drift.locator('[aria-live] .bridge-code-del')).toContainText('send(to: string, text: string)')
  await drift.getByRole('tab', { name: 'Finding' }).click()
  await expect(drift.getByRole('status')).toContainText('CHANGED_REFERENCE docs/guides/sending-notifications.md:8 → send')
  await expect(drift.locator('[aria-live] .bridge-guide-row[data-state="flagged"]')).toContainText('To send a notification')
  await drift.getByRole('tab', { name: 'Fixed' }).click()
  await expect(drift.locator('[aria-live] .bridge-guide-row[data-state="fixed"]')).toContainText('channel: "email"')
})

test('the publication gate shows advisory, blocked and passed states', async ({ page }) => {
  await page.goto('/')
  const gate = page.locator('#gate')
  await gate.scrollIntoViewIfNeeded()
  await expect(gate.getByRole('status')).toHaveText('Failed · publication blocked')
  await expect(gate.locator('.bridge-gate-terminal [aria-live]')).toContainText('Nothing was written', { timeout: 10000 })

  await gate.getByRole('button', { name: 'Fix the doc' }).click()
  await expect(gate.getByRole('status')).toHaveText('Passed · index and llms.txt published')
  await expect(gate.locator('.bridge-gate-terminal [aria-live]')).toContainText('json: ok=true gate=0 pending', { timeout: 10000 })

  await gate.getByRole('switch', { name: 'Publication gate' }).click()
  await expect(gate.getByRole('switch', { name: 'Publication gate' })).toHaveAttribute('aria-checked', 'false')
  await expect(gate.getByRole('status')).toContainText('Advisory · 3 pending findings, published anyway')
  await expect(gate.getByRole('button', { name: 'Fix the doc' })).toBeDisabled()

  await gate.getByRole('button', { name: 'Reset demo' }).click()
  await expect(gate.getByRole('status')).toHaveText('Failed · publication blocked')
})

test('surfaces and measured sections carry the flow and the numbers', async ({ page }) => {
  await page.goto('/')
  const surfaces = page.locator('#surfaces')
  await expect(surfaces.getByRole('img', { name: /Docs and code flow into one deterministic index/ })).toBeAttached()
  await expect(surfaces.getByRole('link', { name: 'reviewable docs draft' })).toHaveAttribute('href', /\/docs\/guides\/memory-pipeline\/?$/)
  await expect(page.locator('#measured .bridge-principle')).toHaveCount(5)
})
