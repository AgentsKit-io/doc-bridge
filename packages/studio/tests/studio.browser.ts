import { test, expect, type Page } from '@playwright/test'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { StudioGraphV1Schema, whyStudioNode } from '@agentskit/doc-bridge'
import { serveStudio } from '../dist/server.js'

const sourceTree = execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim()
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const evidenceDir = process.env.STUDIO_EVIDENCE_DIR ?? join(tmpdir(), 'docbridge-studio-evidence')
async function capture(page: Page, name: string) {
  mkdirSync(evidenceDir, { recursive: true }); const path = join(evidenceDir, name + '.png')
  await page.screenshot({ path, fullPage: true })
  return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }
}
async function checkContrast(page: Page) {
  const contrast = await page.evaluate(() => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 })
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
    }
    return [...document.querySelectorAll('button:not(:disabled),p,label,h1,h2,h3,summary,input,textarea,select')].filter(element => (element as HTMLElement).offsetHeight > 0).map(element => {
      let current: Element | null = element; let background = 'rgb(250, 250, 250)'
      while (current) { const color = getComputedStyle(current).backgroundColor; if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break }; current = current.parentElement }
      const a = luminance(getComputedStyle(element).color), b = luminance(background)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })
  })
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5)
  return Math.min(...contrast)
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`real-browser sample flows at ${viewport.width}px`, async ({ page }) => {
    const stateDir = mkdtempSync(join(tmpdir(), 'studio-browser-'))
    const graph = StudioGraphV1Schema.parse(JSON.parse(readFileSync(resolve('../../docs/design/studio-samples/synthetic.json'), 'utf8')))
    const running = await serveStudio({ stateDir, readOnly: true, assetsDir: resolve('dist'), backend: { graph: () => graph, why: id => whyStudioNode(graph, id), search: () => { throw new Error('Sample mode has no matching search index.') }, act: async () => { throw new Error('Sample mode is read-only.') } } })
    const screenshots: { path: string; sha256: string }[] = []
    const errors: string[] = []; const network: number[] = []
    page.on('pageerror', () => errors.push('Uncaught browser error'))
    page.on('console', entry => { if (entry.type() === 'error' && !entry.text().includes('status of 409')) errors.push('Browser console error') })
    page.on('response', response => { if (response.status() >= 400) network.push(response.status()) })
    try {
      await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' })
      const loadStart = performance.now()
      await page.goto(running.url, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: /Accessible entity list/ })).toBeVisible()
      await expect(page.getByRole('status')).toHaveText('Graph refreshed.')
      const initialRenderMs = Math.round(performance.now() - loadStart)
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.locator('.canvas').hover(); await page.mouse.wheel(0, -100)
      await page.getByRole('button', { name: 'Reset graph', exact: true }).click()
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('document')
      await expect(page.locator('.entities li')).toHaveCount(graph.nodes.filter(node => node.kind === 'document').length)
      await page.locator('.entities button').first().focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('complementary', { name: 'Entity evidence' })).toBeVisible()
      await expect(page.getByRole('status')).toHaveText('Entity evidence loaded.')
      await page.keyboard.press('Escape'); await expect(page.getByRole('complementary')).toHaveCount(0)
      await expect(page.locator('.entities button').first()).toBeFocused()
      await page.locator('.entities button').first().click()
      await expect(page.getByRole('status')).toHaveText('Entity evidence loaded.')
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('package')
      await expect(page.getByText('Selected entity is hidden by filters;', { exact: false })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('complementary')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeFocused()
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('document')
      await page.locator('.entities button').first().click()
      await expect(page.getByRole('status')).toHaveText('Entity evidence loaded.')
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('')
      await page.getByLabel('Focus on selection and neighbors').check()
      const selectedId = graph.nodes.find(node => node.kind === 'document')!.id
      const neighbors = new Set([selectedId]); for (const edge of graph.edges) { if (edge.from === selectedId) neighbors.add(edge.to); if (edge.to === selectedId) neighbors.add(edge.from) }
      await expect(page.locator('.entities li')).toHaveCount(neighbors.size)
      await page.keyboard.press('Escape')
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('')
      await page.getByRole('button', { name: 'Drift inbox', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Reference findings' })).toBeVisible()
      await expect(page.getByLabel('Reviewer identity')).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Approve correction', exact: true }).first()).toBeDisabled()
      await expect(page.getByRole('alert')).toHaveCount(0)
      screenshots.push(await capture(page, `inbox-${viewport.width}-sample`))
      await page.getByRole('button', { name: 'Search and why', exact: true }).click()
      await expect(page.getByLabel('Search indexed documents and modules')).toBeDisabled()
      await expect(page.getByText('Ranked search is unavailable in sample mode', { exact: false })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      screenshots.push(await capture(page, `search-${viewport.width}-sample`))
      await page.getByRole('button', { name: 'Knowledge graph', exact: true }).click()
      await page.getByLabel('Label or path filter').fill('no-such-node'); await expect(page.getByText('No entities match.', { exact: false })).toBeVisible()
      await page.getByLabel('Label or path filter').fill(''); await page.getByRole('button', { name: 'Dark theme' }).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      expect(overflow).toBe(false)
      mkdirSync(evidenceDir, { recursive: true })
      let minContrast = Infinity
      for (const mode of ['dark', 'light']) {
        if (mode === 'light') await page.getByRole('button', { name: 'Dark theme' }).click()
        await expect(page.locator('.canvas')).toHaveCSS('background-color', mode === 'dark' ? 'rgb(41, 47, 53)' : 'rgb(240, 241, 242)')
        minContrast = Math.min(minContrast, await checkContrast(page))
        screenshots.push(await capture(page, `graph-${viewport.width}-${mode}`))
      }
      expect(errors).toEqual([])
      // Read-only sample controls must not issue unavailable requests.
      expect(network).toEqual([])
      writeFileSync(join(evidenceDir, `results-${viewport.width}.json`), JSON.stringify({ sourceTree, sourceRevision, capabilities: ['real-browser', 'screenshot'], viewport, screenshots, initialRenderMs, minTextContrast: minContrast, criteria: { graph: 'passed', filters: 'passed', keyboard: 'passed', focusRestoration: 'passed', hiddenSelection: 'passed', neighbors: 'passed', sampleReadOnly: 'passed', sampleSearchInformation: 'passed', reducedMotion: 'passed', overflow: 'passed', contrast: 'passed', console: 'passed', network: 'passed' } }, null, 2))
    } finally { await page.close(); await running.close(); rmSync(stateDir, { recursive: true, force: true }) }
  })
}
test('real-browser indexed search and proposal decision at desktop', async ({ page }) => {
  const { applyConfigDefaults, buildDocBridgeIndex } = await import('@agentskit/doc-bridge')
  const { exportVault } = await import('../../../src/vault/export.js')
  const { diffVault } = await import('../../../src/vault/diff.js')
  const { createStudioBackend } = await import('../dist/server.js')
  const root = mkdtempSync(join(tmpdir(), 'studio-live-browser-'))
  let running: Awaited<ReturnType<typeof serveStudio>> | undefined
  try {
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'src'))
  writeFileSync(join(root, '.gitignore'), '.doc-bridge/\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@agentskit/example', version: '1.0.0' }))
  writeFileSync(join(root, 'src/module.ts'), 'export const sample = 1\n')
  writeFileSync(join(root, 'docs/guide.md'), '# Sample guide\n\n`sample`\n')
  const config = applyConfigDefaults({ schemaVersion: 1, project: { name: 'studio-example' }, intelligence: { registry: { enabled: true } }, corpus: { agent: { root: 'docs/agent' }, human: { plugin: 'plain-markdown', options: { root: 'docs' } } } })
  writeFileSync(join(root, 'doc-bridge.config.json'), JSON.stringify(config))
  await exportVault(root, config)
  const note = join(root, '.doc-bridge/vault', `${createHash('sha256').update('document:docs/guide.md').digest('hex')}.md`)
  writeFileSync(note, readFileSync(note, 'utf8') + '\nHuman suggestion.\n'); await diffVault(root, config)
  const { readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } = await import('../../../src/enrich/overlay.js')
  const { EnrichmentProposalV1Schema, enrichmentProposalId } = await import('../../../src/schemas/enrichment.js')
  const { enrichmentApprovalId } = await import('../../../src/enrich/approvals.js')
  const overlay = readEnrichmentOverlay(root)!
  const identity = { ...overlay.pending[0]!.proposal, kind: 'summarize' as const, payload: { summary: 'Sample guide describes the sample export.', language: 'en' } }
  const proposal = EnrichmentProposalV1Schema.parse({ ...identity, proposalId: enrichmentProposalId(identity) })
  writeEnrichmentOverlay(root, sealEnrichmentOverlay({ ...overlay, pending: [{ proposal, approvalId: enrichmentApprovalId(proposal.proposalId, proposal.targetContentHash) }] }))
  buildDocBridgeIndex({ root, config, write: true })
  const backend = createStudioBackend({ cwd: root })
  const decide = backend.act
  backend.act = async action => {
    const result = await decide(action)
    if (action.action === 'approve') rmSync(join(root, '.doc-bridge/index.json'))
    return result
  }
  running = await serveStudio({ backend, stateDir: join(root, '.doc-bridge/studio'), assetsDir: resolve('dist') })
  const errors: string[] = []; page.on('pageerror', () => errors.push('Uncaught browser error'))
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(running.url, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Search and why', exact: true }).click()
    await page.getByLabel('Search indexed documents and modules').fill('sample'); await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('ranked matches.')
    await page.locator('article button').first().click(); await expect(page.getByRole('status')).toHaveText('Entity evidence loaded.')
    await expect(page.getByRole('complementary')).toContainText('Relationships')
    const whyScreenshot = await capture(page, 'live-why-1280')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Drift inbox', exact: true }).click()
    await page.getByLabel('Reviewer identity').fill('human-reviewer'); await page.getByLabel('Review reason').fill('Reviewed current evidence')
    await page.getByRole('button', { name: 'Prepare draft PR preview', exact: true }).click()
    await expect(page.getByText('Local draft preview', { exact: true })).toBeVisible()
    writeFileSync(join(root, 'docs/guide.md'), '# Changed sample guide\n'); buildDocBridgeIndex({ root, config, write: true })
    await page.getByRole('button', { name: 'Approve correction', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Stale index binding')
    await expect(page.getByLabel('Review reason')).toHaveValue('Reviewed current evidence')
    await capture(page, 'live-inbox-stale-1280')
    writeFileSync(join(root, 'docs/guide.md'), '# Sample guide\n\n`sample`\n'); buildDocBridgeIndex({ root, config, write: true })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Graph refreshed.')
    await page.getByRole('button', { name: 'Inspect document:docs/guide.md', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Entity evidence loaded.')
    await page.getByRole('button', { name: 'Approve correction', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Decision recorded. Source documents remain unchanged.')
    await expect(page.getByRole('button', { name: 'Approve correction', exact: true })).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveText('Decision recorded. Graph refresh failed; run ak-docs index, then Refresh.')
    const updated = buildDocBridgeIndex({ root, config, write: true }).index; await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('complementary')).toContainText(updated.contentHash); await expect(page.getByRole('alert')).toHaveCount(0)
    expect(readFileSync(join(root, 'docs/guide.md'), 'utf8')).toBe('# Sample guide\n\n`sample`\n')
    expect(errors).toEqual([])
    mkdirSync(evidenceDir, { recursive: true }); const path = join(evidenceDir, 'live-inbox-1280.png'); await page.screenshot({ path, fullPage: true })
    writeFileSync(join(evidenceDir, 'results-live.json'), JSON.stringify({ sourceTree, sourceRevision, capabilities: ['real-browser', 'screenshot'], viewport: { width: 1280, height: 900 }, screenshots: [whyScreenshot, { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }], criteria: { rankedSearch: 'passed', why: 'passed', draftPreview: 'passed', approval: 'passed', sourcePreservation: 'passed', staleFailure: 'passed', reviewDraftPreserved: 'passed', recovery: 'passed', recordedDecisionAfterMissingIndex: 'passed', refreshedEntityBinding: 'passed', console: 'passed' } }, null, 2))
  } finally { await page.close(); await running?.close(); rmSync(root, { recursive: true, force: true }) }
})
for (const name of ['doc-bridge', 'agentskit']) {
  test(`real-browser committed ${name} graph and truncation`, async ({ page }) => {
    const stateDir = mkdtempSync(join(tmpdir(), 'studio-browser-'))
    const graph = StudioGraphV1Schema.parse(JSON.parse(readFileSync(resolve(`../../docs/design/studio-samples/${name}.json`), 'utf8')))
    const running = await serveStudio({ stateDir, readOnly: true, assetsDir: resolve('dist'), backend: { graph: () => graph, why: id => whyStudioNode(graph, id), search: () => { throw new Error('Sample mode has no matching index.') }, act: async () => { throw new Error('Read-only sample') } } })
    const errors: string[] = []; page.on('pageerror', () => errors.push('Browser error'))
    try {
      await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(running.url, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.entities li')).toHaveCount(graph.nodes.length)
      await expect(page.getByRole('region', { name: 'Coverage' })).toContainText('omitted')
      await expect(page.getByRole('region', { name: 'Coverage' })).toContainText('Findings: not-analyzed')
      await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('package')
      await expect(page.locator('.entities li')).toHaveCount(graph.nodes.filter(node => node.kind === 'package').length)
      const screenshot = await capture(page, `sample-${name}-1280`)
      expect(errors).toEqual([])
      writeFileSync(join(evidenceDir, `results-${name}.json`), JSON.stringify({ sourceTree, sourceRevision, capabilities: ['real-browser', 'screenshot'], viewport: { width: 1280, height: 900 }, screenshots: [screenshot], criteria: { sample: 'passed', truncation: 'passed', missingAnalysis: 'passed', filter: 'passed', console: 'passed' } }, null, 2))
    } finally { await page.close(); await running.close(); rmSync(stateDir, { recursive: true, force: true }) }
  })
}

test('starts the optional built Studio through the real executable and stops on a signal', async () => {
  const { spawn } = await import('node:child_process'); const { fileURLToPath } = await import('node:url')
  const root = mkdtempSync(join(tmpdir(), 'studio-cli-browser-'))
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../../bin/ak-docs.js', import.meta.url)), 'studio', '--sample', 'synthetic'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const exited = new Promise<number | null>(accept => child.once('exit', accept))
  try {
    const url = await new Promise<string>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error('Studio startup did not become ready')), 5000)
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Studio startup exited early')) })
      child.stdout.on('data', chunk => { output += chunk; const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]{64}/.exec(output); if (match) { clearTimeout(timeout); accept(match[0]) } })
      child.stderr.on('data', () => {})
    })
    const response = await fetch(url); expect(response.status).toBe(200); expect(await response.text()).toContain('doc-bridge Studio')
  } finally { child.kill('SIGTERM'); await exited; rmSync(root, { recursive: true, force: true }) }
})
