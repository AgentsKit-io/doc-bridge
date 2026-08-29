import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const reportPath = resolve(args.find((arg) => !arg.startsWith('--')) ?? '.doc-bridge/report.html')
const outputFlag = args.indexOf('--output')
const outputDir = resolve(outputFlag >= 0 ? args[outputFlag + 1] ?? '.doc-bridge/visual-acceptance' : '.doc-bridge/visual-acceptance')
const humanApproved = args.includes('--human-approved')
const interactionTimeoutMs = 2500
const viewports = [[390, 844], [768, 1024], [1440, 900], [1600, 1000], [1920, 1080]]
const themes = ['light', 'dark']
const failures = []
const checks = []
const networkRequests = []
const clock = () => performance.now()

mkdirSync(outputDir, { recursive: true })

const record = (viewport, theme, result) => {
  const entry = { viewport: `${viewport[0]}x${viewport[1]}`, theme, ...result }
  checks.push(entry)
  for (const failure of result.failures ?? []) failures.push(`${entry.viewport}/${theme}: ${failure}`)
}

const inspect = async (frame, width, height) => frame.evaluate(({ width: viewportWidth, height: viewportHeight }) => {
  const controls = [...document.querySelectorAll('#search,#status,#severity,#reset,[data-lens],[data-level]')]
  const clippedControls = controls.filter((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && (rect.left < 0 || rect.right > viewportWidth || rect.top < 0 || rect.bottom > viewportHeight)
  }).map((element) => element.id || element.dataset.lens || element.dataset.level || element.tagName)
  const workspace = document.querySelector('.workspace')?.getBoundingClientRect()
  const graph = document.querySelector('#graph')?.getBoundingClientRect()
  const failures = []
  if (document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) failures.push('horizontal overflow')
  if (clippedControls.length) failures.push(`clipped controls: ${clippedControls.join(', ')}`)
  if (!workspace || workspace.top > viewportHeight * 0.7) failures.push('architecture map starts too far below the first screen')
  if (!document.querySelector('#graph')) failures.push('architecture graph is missing')
  if (document.querySelectorAll('[data-lens]').length < 4 || document.querySelectorAll('[data-level]').length < 4) failures.push('required lens or level controls are missing')
  if (document.querySelectorAll('.finding').length > 40) failures.push('initial findings render grows beyond one bounded page')
  if (graph && graph.width < Math.min(480, viewportWidth * 0.7)) failures.push('architecture graph is too narrow to inspect')

  const unnamedButtons = [...document.querySelectorAll('button')].filter((button) => {
    const rect = button.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && !button.textContent.trim() && !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby')
  })
  if (unnamedButtons.length) failures.push(`unnamed visible buttons: ${unnamedButtons.length}`)

  const visibleOverflow = [...document.querySelectorAll('body *')].filter((element) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height || element.closest('.map-wrap')) return false
    const horizontalOverflow = element.scrollWidth > element.clientWidth + 2
    const containerOverflow = element.children.length > 0 && element.scrollHeight > element.clientHeight + 2
    return horizontalOverflow || containerOverflow
  })
  if (visibleOverflow.length) failures.push(`text/content overflow: ${visibleOverflow.slice(0, 3).map((element) => element.id || element.className || element.tagName).join(', ')}`)

  const parseColor = (value) => {
    const text = String(value).trim()
    const hex = text.match(/^#([0-9a-f]{3,8})$/i)?.[1]
    if (hex) {
      const expanded = hex.length <= 4 ? [...hex].map((channel) => channel + channel).join('') : hex
      return [expanded.slice(0, 2), expanded.slice(2, 4), expanded.slice(4, 6)].map((channel) => Number.parseInt(channel, 16) / 255)
    }
    const rgb = text.match(/rgba?\(([^)]+)\)/i)?.[1]
    return rgb ? rgb.split(',').slice(0, 3).map((channel) => Number.parseFloat(channel.trim()) / 255) : null
  }
  const luminance = (rgb) => rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrast = (foreground, background) => { const a = luminance(foreground); const b = luminance(background); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
  const rootStyle = getComputedStyle(document.documentElement)
  const ink = parseColor(rootStyle.getPropertyValue('--ink'))
  const muted = parseColor(rootStyle.getPropertyValue('--muted'))
  const paper = parseColor(rootStyle.getPropertyValue('--paper'))
  const panel = parseColor(rootStyle.getPropertyValue('--panel'))
  const contrastFailures = []
  for (const [name, foreground] of [['ink', ink], ['muted', muted]]) {
    for (const [backgroundName, background] of [['paper', paper], ['panel', panel]]) {
      if (foreground && background && contrast(foreground, background) < 4.5) contrastFailures.push(`${name}/${backgroundName}`)
    }
  }
  if (contrastFailures.length) failures.push(`insufficient text contrast: ${contrastFailures.join(', ')}`)

  return {
    failures,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clippedControls,
    workspaceTop: workspace?.top ?? null,
    graphWidth: graph?.width ?? null,
    initialFindingCount: document.querySelectorAll('.finding').length,
    findingGroupCount: document.querySelectorAll('.finding-group').length,
    diagnosticCount: typeof globalThis.__DOC_BRIDGE_DATA__?.diagnosticCount === 'number'
      ? globalThis.__DOC_BRIDGE_DATA__.diagnosticCount
      : Number.parseInt(document.querySelector('#finding-count')?.textContent ?? '', 10) || document.querySelectorAll('.finding').length,
    unnamedButtonCount: unnamedButtons.length,
    visibleOverflowCount: visibleOverflow.length,
    contrastFailures,
  }
}, { width, height })

const poll = async (read, predicate, label, timeoutMs = interactionTimeoutMs) => {
  const started = clock()
  while (clock() - started < timeoutMs) {
    if (predicate(await read())) return Math.round(clock() - started)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`${label} did not reach the expected state within ${timeoutMs}ms`)
}

const exercise = async (frame, result) => {
  result.interactionDurationsMs ??= []
  const run = async (label, action, verify, browserEvent) => {
    const started = clock()
    try {
      if (browserEvent) await frame.evaluate((type) => {
        document.documentElement.dataset.docBridgeInteractionStartedAt = ''
        window.addEventListener(type, () => {
          document.documentElement.dataset.docBridgeInteractionStartedAt = String(performance.now())
        }, { capture: true, once: true })
      }, browserEvent)
      await Promise.race([
        (async () => { await action(); if (verify) await verify() })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('interaction timeout')), interactionTimeoutMs)),
      ])
      const gestureDurationMs = Math.round(clock() - started)
      const durationMs = browserEvent
        ? await frame.evaluate(() => {
          const startedAt = Number(document.documentElement.dataset.docBridgeInteractionStartedAt)
          return Number.isFinite(startedAt) ? Math.round(performance.now() - startedAt) : null
        })
        : gestureDurationMs
      if (durationMs == null) throw new Error(`${browserEvent} event was not observed`)
      result.interactionDurationsMs.push({ label, durationMs, ...(browserEvent ? { gestureDurationMs } : {}) })
      if (browserEvent) {
        const renderTimings = await frame.evaluate(() => JSON.parse(document.documentElement.dataset.docBridgeRenderTimings || '{}'))
        result.renderTimings ??= []
        result.renderTimings.push({ label, ...renderTimings })
      }
      if (durationMs > 2000) result.failures.push(`${label} took ${durationMs}ms`)
    } catch (error) {
      result.interactionDurationsMs.push({ label, durationMs: Math.round(clock() - started), failed: true })
      result.failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const [lens, view] of [['architecture', 'architecture'], ['drift', 'insights'], ['risks', 'findings'], ['evidence', 'coverage']]) {
    await run(`lens ${lens}`, () => frame.locator(`[data-lens="${lens}"]`).click(), async () => {
      await poll(() => frame.locator('body').getAttribute('data-report-view'), (actual) => actual === view, `lens ${lens}`)
      if (await frame.locator(`[data-lens="${lens}"]`).getAttribute('aria-selected') !== 'true') throw new Error('aria-selected did not follow the active lens')
    })
  }

  await run('finding groups load', async () => {
    const load = frame.locator('#load-findings')
    if (await load.count()) await load.click()
    else if (result.diagnosticCount > 0 && await frame.locator('.finding-group').count() === 0) throw new Error('finding loader is missing while findings are present')
  }, async () => {
    if (result.diagnosticCount > 0) {
      await poll(() => frame.locator('.finding-group').count(), (count) => count > 0, 'finding groups')
    } else if (await frame.locator('.finding-group').count() !== 0) {
      throw new Error('finding groups rendered despite zero findings')
    }
  })

  await run('map reset', () => frame.locator('[data-lens="architecture"]').click(), async () => {
    await poll(() => frame.locator('body').getAttribute('data-report-view'), (actual) => actual === 'architecture', 'map reset')
  })

  if (!(await frame.locator('[data-node]').count())) result.failures.push('architecture graph has no interactive nodes')
  else {
    const drillSelectors = [
      ['package', ['[data-node][aria-label*=" app"]', '[data-node][aria-label*=" domain"]', '[data-node][aria-label*=" group"]', '[data-node]']],
      ['module', ['[data-node][aria-label*=" package"]', '[data-node][aria-label*=" shared"]']],
      ['file', ['[data-node][aria-label*=" module"]', '[data-node][aria-label*=" file"]']],
    ]
    for (const [expectedLevel, selectors] of drillSelectors) {
      let selector
      for (const candidate of selectors) {
        if (await frame.locator(candidate).count()) {
          selector = candidate
          break
        }
      }
      if (!selector) continue
      await run(`double-click drill-down to ${expectedLevel}`, () => frame.locator(selector).first().dblclick(), async () => {
        await poll(() => frame.locator('[data-level][aria-pressed="true"]').getAttribute('data-level'), (actual) => actual === expectedLevel, `drill-down ${expectedLevel}`)
        const details = await frame.locator('#details').innerText()
        if (/Select a node in the map/i.test(details)) throw new Error('details panel did not update')
      }, 'dblclick')
    }
    if (await frame.locator('#breadcrumbs [data-breadcrumb-level]').count() < 1) result.failures.push('drill-down did not create usable breadcrumbs')
    await run('breadcrumb back to repository', () => frame.locator('#breadcrumbs [data-breadcrumb-level="overview"]').click(), async () => {
      await poll(() => frame.locator('[data-level][aria-pressed="true"]').getAttribute('data-level'), (actual) => actual === 'overview', 'breadcrumb repository')
    })
  }

  const map = frame.locator('.map-wrap')
  const beforeTransform = await frame.locator('#graph').getAttribute('style')
  await run('map zoom', () => map.dispatchEvent('wheel', { deltaY: -120, deltaX: 0 }), async () => {
    const afterTransform = await frame.locator('#graph').getAttribute('style')
    if (!afterTransform || afterTransform === beforeTransform || !afterTransform.includes('scale(')) throw new Error('zoom did not change the graph transform')
  })
  await run('map reset keyboard', () => frame.locator('body').dispatchEvent('keydown', { key: '0' }), async () => {
    const transform = await frame.locator('#graph').getAttribute('style')
    if (!transform?.includes('scale(1)')) throw new Error('keyboard reset did not restore scale 1')
  })
  await run('clear selection', () => frame.locator('#clear-selection').click())
}

let browser
try {
  browser = await chromium.launch()
  const warmup = await browser.newPage()
  await warmup.goto('about:blank')
  await warmup.close()
  for (const theme of themes) {
    for (const viewport of viewports) {
      const page = await browser.newPage()
      const pageErrors = []
      const consoleErrors = []
      const failedRequests = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
      page.on('requestfailed', (request) => failedRequests.push(`${request.url()} · ${request.failure()?.errorText ?? 'failed'}`))
      page.on('request', (request) => networkRequests.push(request.url()))
      let result = { failures: [] }
      try {
        await page.setViewportSize({ width: viewport[0], height: viewport[1] })
        await page.emulateMedia({ colorScheme: theme })
        const renderStarted = clock()
        await page.goto(pathToFileURL(reportPath).href, { waitUntil: 'load' })
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url().endsWith('/report/index.html')) ?? page.mainFrame()
        await frame.locator('#graph').waitFor({ state: 'visible', timeout: interactionTimeoutMs })
        result = await inspect(frame, viewport[0], viewport[1])
        result.firstRenderMs = Math.round(clock() - renderStarted)
        await exercise(frame, result)
        result.pageErrors = pageErrors
        result.consoleErrors = consoleErrors
        result.failedRequests = failedRequests
        if (pageErrors.length) result.failures.push(`page errors: ${pageErrors.join(' | ')}`)
        if (consoleErrors.length) result.failures.push(`console errors: ${consoleErrors.join(' | ')}`)
        if (failedRequests.length) result.failures.push(`failed requests: ${failedRequests.join(' | ')}`)
        await page.screenshot({ path: join(outputDir, `${viewport[0]}x${viewport[1]}-${theme}.png`), fullPage: false })
      } catch (error) {
        result.failures.push(error instanceof Error ? error.message : String(error))
      }
      record(viewport, theme, result)
      await page.close()
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error))
} finally {
  await browser?.close()
}

const status = failures.length || checks.some((check) => check.failures.length) ? 'failed' : humanApproved ? 'passed' : 'pending-human-review'
const artifacts = checks.map((check) => {
  const path = join(outputDir, `${check.viewport}-${check.theme}.png`)
  return existsSync(path) ? { type: 'screenshot', path: relative(process.cwd(), path), sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), viewport: check.viewport, theme: check.theme } : null
}).filter(Boolean)
const result = {
  status,
  capability: 'real-browser',
  artifacts,
  criteria: { 'report-ui': { status: status === 'failed' ? 'failed' : 'passed' } },
  reportPath,
  outputDir,
  viewports,
  themes,
  networkRequests,
  checks,
  failures,
  note: status === 'failed'
    ? 'Automated visual or interaction evidence failed; human approval is not available for this run.'
    : humanApproved
      ? 'Automated checks passed and human approval was explicitly supplied.'
      : 'Automated checks passed; screenshots require human visual review. Re-run with --human-approved only after review.',
}
writeFileSync(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status,
  capability: result.capability,
  artifacts: result.artifacts,
  criteria: result.criteria,
  reportPath: result.reportPath,
  outputDir: result.outputDir,
  viewports: result.viewports,
  themes: result.themes,
  failures: result.failures,
  note: result.note,
}))
if (status === 'failed') process.exitCode = 1
