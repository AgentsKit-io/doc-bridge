import { expect, test } from '@playwright/test'

test('landing sections and recorded interactive demos are present', async ({ page }) => {
  await page.goto('/')
  for (const id of ['ask', 'finding', 'gate', 'surfaces', 'measured']) {
    await expect(page.locator(`#${id}`)).toBeAttached()
  }

  const drift = page.locator('#finding')
  await drift.getByRole('button', { name: '@demo/notify · send()' }).click()
  await expect(drift.getByText('CHANGED_REFERENCE docs/guides/sending-notifications.md:8 → send')).toBeVisible()

  const gate = page.locator('#gate')
  await gate.getByRole('button', { name: 'Fix the doc' }).click()
  await expect(gate.getByText('json: ok=true gate=0 pending')).toBeVisible()
  await gate.getByRole('button', { name: 'Reset demo' }).click()
  await expect(gate.locator('.bridge-recording pre')).toContainText('Publication blocked:')
})
