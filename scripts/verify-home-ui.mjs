import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseURL = process.env.DOC_BRIDGE_PREVIEW_URL ?? 'http://localhost:3112'
const outputDir = resolve(process.env.DOC_BRIDGE_UI_OUTPUT_DIR ?? '.codex/verification/home-ui')
mkdirSync(outputDir, { recursive: true })
const results = []
const screenshots = []
const failures = []
const consoleErrors = []
const failedRequests = []
const cancelledRequests = []
let browser

const check = (id, passed, detail) => {
  results.push({ id, status: passed ? 'passed' : 'failed', detail })
  if (!passed) failures.push(`${id}: ${detail}`)
}

const screenshot = async (page, name, viewport) => {
  const path = resolve(outputDir, `${name}.png`)
  const buffer = await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  screenshots.push({ path, viewport: `${viewport.width}x${viewport.height}`, sha256: createHash('sha256').update(buffer).digest('hex') })
}

const contrast = (foreground, background) => {
  const channels = (color) => color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? []
  const luminance = (color) => {
    const values = channels(color).map((v) => {
      const x = v / 255
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return values.length === 3 ? values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 : 0
  }
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

try {
  browser = await chromium.launch({ headless: true })
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' })
  desktop.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  desktop.on('pageerror', (error) => consoleErrors.push(error.message))
  desktop.on('requestfailed', (request) => {
    const failure = `${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`
    if (request.failure()?.errorText === 'net::ERR_ABORTED') cancelledRequests.push(failure)
    else failedRequests.push(failure)
  })
  const response = await desktop.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 })
  await desktop.waitForTimeout(600)
  const desktopData = await desktop.evaluate(() => {
    const home = document.querySelector('.bridge-home')
    const heading = document.querySelector('h1')
    const handoff = document.querySelector('.bridge-map')
    const description = document.querySelector('.bridge-hero-description')
    const homeStyle = home ? getComputedStyle(home) : null
    const headingStyle = heading ? getComputedStyle(heading) : null
    const descriptionStyle = description ? getComputedStyle(description) : null
    return {
      title: document.title,
      themeClass: document.documentElement.className,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      hasHome: Boolean(home),
      hasAurora: document.querySelectorAll('agentskit-aurora').length === 1 && document.querySelector('agentskit-aurora')?.getAttribute('aria-hidden') === 'true',
      hasLegacyCursor: Boolean(document.querySelector('.bridge-liquid-cursor')),
      hasHandoff: Boolean(handoff),
      bridgeSides: Array.from(document.querySelectorAll('.bridge-map-side')).map((node) => node.getAttribute('aria-label')),
      bridgeCore: document.querySelector('.bridge-map-core')?.textContent?.trim() ?? null,
      bridgeReturn: document.querySelector('.bridge-map-return')?.textContent?.trim() ?? null,
      bridgeConnections: document.querySelectorAll('.bridge-map-lines .bridge-map-track, .bridge-map-lines .bridge-map-return-track').length,
      hasProofTerminal: Boolean(document.querySelector('.bridge-proof-terminal')),
      hasInstallTabs: Boolean(document.querySelector('[role="tablist"][aria-label="Package manager"]')),
      hasHomeStats: Boolean(document.querySelector('.bridge-home-metrics')),
      hasHomeTour: Boolean(document.querySelector('agentskit-ecosystem[current="doc-bridge"][data-visual="agentskit-home"]')),
      hasNumberedProofCards: Boolean(document.querySelector('.bridge-proof-steps')),
      footer: (() => {
        const footer = document.querySelector('agentskit-footer')
        return footer ? { current: footer.getAttribute('current'), repo: footer.getAttribute('repo'), links: footer.querySelectorAll('a[href]').length } : null
      })(),
      hasLegacyFooter: Boolean(document.querySelector('.bridge-home-footer')),
      shellScript: (() => {
        const script = document.querySelector('script[src$="/shell/v1.js"]')
        return script ? { src: script.getAttribute('src'), current: script.dataset.current, repo: script.dataset.currentRepo } : null
      })(),
      shellStylesheet: document.querySelector('link[rel="stylesheet"][href$="/shell/v1.css"]')?.getAttribute('href') ?? null,
      legacyBarScript: Boolean(document.querySelector('script[src$="ecosystem-bar.js"]')),
      headerWordmark: document.querySelector('.bridge-home-header .ak-product-wordmark')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      headerGithubLinks: document.querySelectorAll('.bridge-home-header a[href*="github.com"]').length,
      barBeforeHeader: (() => {
        const bar = document.querySelector('#ak-eco')
        const header = document.querySelector('.bridge-home-header')
        return Boolean(bar && header && (bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING))
      })(),
      tourBeforeFooter: (() => {
        const tour = document.querySelector('agentskit-ecosystem')
        const footer = document.querySelector('agentskit-footer')
        return Boolean(tour && footer && (tour.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING))
      })(),
      ecosystemLinks: Array.from(document.querySelectorAll('#ak-eco .ak-eco-link:not(.ak-eco-cta)')).map((node) => node.textContent),
      ecosystemStar: document.querySelector('#ak-eco .ak-eco-cta')?.getAttribute('href'),
      terminalTabs: Array.from(document.querySelectorAll('[role="tablist"][aria-label="CLI demo stages"] [role="tab"]')).map((node) => node.textContent?.trim()),
      navigationDuration: performance.getEntriesByType('navigation')[0]?.duration ?? null,
      heading: heading?.innerText,
      background: homeStyle?.backgroundColor,
      foreground: headingStyle?.color,
      bodyCopy: descriptionStyle?.color,
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      copyButtons: document.querySelectorAll('button[aria-label="Copy"]')?.length ?? 0,
    }
  })
  check('desktop-http', response?.ok() === true, `HTTP ${response?.status()}`)
  check('dark-default', desktopData.themeClass.includes('dark') && desktopData.colorScheme === 'dark', JSON.stringify({ themeClass: desktopData.themeClass, colorScheme: desktopData.colorScheme }))
  check('shared-aurora-and-bridge-map', desktopData.hasHome && desktopData.hasAurora && !desktopData.hasLegacyCursor && desktopData.hasHandoff && desktopData.bridgeSides.join(',') === 'Human documentation,Agent context and tools' && desktopData.bridgeCore.includes('Doc Bridge') && desktopData.bridgeReturn.includes('review'), JSON.stringify({ hasHome: desktopData.hasHome, hasAurora: desktopData.hasAurora, legacyCursor: desktopData.hasLegacyCursor, hasHandoff: desktopData.hasHandoff, sides: desktopData.bridgeSides, core: desktopData.bridgeCore, return: desktopData.bridgeReturn }))
  check('desktop-bridge-connectors', desktopData.bridgeConnections === 3, `Three connector groups connect sources, core, and agent contexts; found ${desktopData.bridgeConnections}`)
  check('shared-shell-v1-assets', desktopData.shellScript?.current === 'doc-bridge' && desktopData.shellScript?.repo === 'AgentsKit-io/doc-bridge' && Boolean(desktopData.shellStylesheet) && !desktopData.legacyBarScript, JSON.stringify({ script: desktopData.shellScript, stylesheet: desktopData.shellStylesheet, legacyBarScript: desktopData.legacyBarScript }))
  check('shared-ecosystem-bar-six-products', desktopData.ecosystemLinks.join(',') === 'AgentsKit,Registry,Chat,Doc Bridge,Code Review,Harness' && desktopData.ecosystemStar === 'https://github.com/AgentsKit-io/doc-bridge' && desktopData.barBeforeHeader && !desktopData.hasNumberedProofCards, JSON.stringify({ links: desktopData.ecosystemLinks, star: desktopData.ecosystemStar, barBeforeHeader: desktopData.barBeforeHeader, proofCards: desktopData.hasNumberedProofCards }))
  check('product-header-wordmark-without-github', desktopData.headerWordmark === 'AgentsKit Doc Bridge' && desktopData.headerGithubLinks === 0, JSON.stringify({ wordmark: desktopData.headerWordmark, githubLinks: desktopData.headerGithubLinks }))
  check('home-ecosystem-tour', desktopData.hasHomeTour && desktopData.tourBeforeFooter, JSON.stringify({ tour: desktopData.hasHomeTour, tourBeforeFooter: desktopData.tourBeforeFooter }))
  check('shared-footer', !desktopData.hasHomeStats && !desktopData.hasLegacyFooter && desktopData.footer?.current === 'doc-bridge' && desktopData.footer?.repo === 'AgentsKit-io/doc-bridge' && desktopData.footer.links > 0, JSON.stringify({ hasHomeStats: desktopData.hasHomeStats, legacyFooter: desktopData.hasLegacyFooter, footer: desktopData.footer }))
  const serverHtml = await (await desktop.request.get(baseURL)).text()
  const serverFooter = serverHtml.match(/<agentskit-footer[\s\S]*?<\/agentskit-footer>/u)?.[0] ?? ''
  const fallbackHomes = ['https://www.agentskit.io', 'https://registry.agentskit.io', 'https://chat.agentskit.io', 'https://doc-bridge.agentskit.io/', 'https://code-review.agentskit.io', 'https://harness.agentskit.io/']
  const fallbackUrls = [...serverFooter.matchAll(/href="([^"]+)"/gu)].flatMap(([, href]) => {
    try { return [new URL(href, baseURL)] } catch { return [] }
  })
  const fallbackHrefs = new Set(fallbackUrls.map((url) => url.href))
  const fallbackHosts = new Set(fallbackUrls.map((url) => url.hostname))
  const hasRepoLink = fallbackUrls.some((url) => url.hostname === 'github.com' && url.pathname === '/AgentsKit-io/doc-bridge')
  const hasLicenseLink = fallbackUrls.some((url) => url.hostname === 'github.com' && url.pathname.startsWith('/AgentsKit-io/doc-bridge/') && url.pathname.endsWith('/LICENSE'))
  check('footer-static-fallback', fallbackHomes.every((href) => fallbackHrefs.has(new URL(href).href)) && hasRepoLink && hasLicenseLink && !fallbackHosts.has('playbook.agentskit.io'), JSON.stringify({ hrefs: [...fallbackHrefs] }))
  check('terminal-and-install-tabs', desktopData.hasProofTerminal && desktopData.hasInstallTabs, JSON.stringify({ terminal: desktopData.hasProofTerminal, installTabs: desktopData.hasInstallTabs }))
  check('hero-copy', desktopData.heading === 'The docs your team reads.\nThe context your agents need.', desktopData.heading)
  check('desktop-overflow', desktopData.scrollWidth <= desktopData.width, `${desktopData.scrollWidth}px content in ${desktopData.width}px viewport`)
  check('text-contrast', contrast(desktopData.foreground, desktopData.background) >= 7 && contrast(desktopData.bodyCopy, desktopData.background) >= 4.5, `heading ${contrast(desktopData.foreground, desktopData.background).toFixed(2)}:1; body ${contrast(desktopData.bodyCopy, desktopData.background).toFixed(2)}:1`)
  check('home-navigation-latency', desktopData.navigationDuration !== null && desktopData.navigationDuration < 30000, `${desktopData.navigationDuration?.toFixed(0)} ms document navigation; network idle within 30 s`)
  await screenshot(desktop, 'desktop-home', { width: 1440, height: 960 })

  const installTabs = desktop.getByRole('tablist', { name: 'Package manager' })
  const npmTab = installTabs.getByRole('tab', { name: 'npm', exact: true })
  await npmTab.focus()
  await desktop.keyboard.press('ArrowRight')
  const pnpmTab = installTabs.getByRole('tab', { name: 'pnpm' })
  check('install-tabs-keyboard-and-commands', await pnpmTab.getAttribute('aria-selected') === 'true' && (await desktop.locator('#install-command-panel').innerText()).includes('pnpm add -D @agentskit/doc-bridge'), 'ArrowRight selects pnpm and shows its package command')
  await desktop.keyboard.press('ArrowLeft')
  check('install-command-npm', (await desktop.locator('#install-command-panel').innerText()).includes('npm install -D @agentskit/doc-bridge'), 'ArrowLeft restores the npm command')

  const demoTabs = desktop.getByRole('tablist', { name: 'CLI demo stages' })
  await demoTabs.getByRole('tab', { name: 'Resolve' }).click()
  const resolveOutput = desktop.locator('#bridge-terminal-output')
  check('terminal-stage-selection', await demoTabs.getByRole('tab', { name: 'Resolve' }).getAttribute('aria-selected') === 'true' && await resolveOutput.locator('.bridge-terminal-step').count() === 3 && await resolveOutput.getByText('"startHere"', { exact: false }).count() === 1, 'Selecting Resolve reveals the accumulated demo, index, and handoff output')
  const terminalTextColors = await desktop.locator('.bridge-proof-terminal').evaluate((root) => {
    const color = (selector) => getComputedStyle(root.querySelector(selector)).color
    return {
      background: getComputedStyle(root).backgroundColor,
      tokens: ['.bridge-terminal-prompt', '.bridge-terminal-output', '.bridge-terminal-key', '.bridge-terminal-string', '.bridge-terminal-muted'].map(color),
    }
  })
  const terminalTokenRatios = terminalTextColors.tokens.map((foreground) => contrast(foreground, terminalTextColors.background))
  check('terminal-token-contrast', terminalTokenRatios.every((ratio) => ratio >= 4.5), `Terminal token contrast ratios: ${terminalTokenRatios.map((ratio) => ratio.toFixed(2)).join(', ')}`)
  await demoTabs.getByRole('tab', { name: 'Demo' }).focus()
  await desktop.keyboard.press('ArrowRight')
  check('terminal-keyboard-stages', await demoTabs.getByRole('tab', { name: 'Index' }).getAttribute('aria-selected') === 'true' && await demoTabs.getByRole('tab', { name: 'Index' }).evaluate((node) => document.activeElement === node), 'ArrowRight advances and focuses the next terminal stage')
  await demoTabs.getByRole('tab', { name: 'Resolve' }).click()
  await desktop.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  await desktop.mouse.move(10, 10)
  const terminalHasSyntaxColors = await desktop.locator('.bridge-terminal-key').count() >= 3
  const activeProofStep = await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  await desktop.waitForTimeout(4600)
  const nextProofStep = await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  check('colored-terminal-animation', nextProofStep !== activeProofStep && desktopData.terminalTabs.join(',') === 'Demo,Index,Resolve' && terminalHasSyntaxColors, `Proof terminal advanced from ${activeProofStep} to ${nextProofStep}; Resolve syntax colors: ${terminalHasSyntaxColors}`)
  await desktop.locator('.bridge-proof-terminal').hover()
  const hoveredStep = await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  await desktop.waitForTimeout(4500)
  check('terminal-pauses-on-hover', await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step') === hoveredStep, `Stage stays on ${hoveredStep} while the pointer hovers the terminal`)
  await desktop.mouse.move(10, 10)
  const terminalStateButton = desktop.getByRole('button', { name: 'Pause demo' })
  await terminalStateButton.click()
  const manuallyPausedStep = await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  await desktop.waitForTimeout(4400)
  const resumeButton = desktop.getByRole('button', { name: 'Resume demo' })
  check('terminal-manual-pause', await resumeButton.getAttribute('aria-pressed') === 'true' && await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step') === manuallyPausedStep, `Manual pause holds at ${manuallyPausedStep}`)
  await resumeButton.click()
  await desktop.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
  await desktop.mouse.move(10, 10)
  await desktop.waitForTimeout(4400)
  check('terminal-manual-resume', await desktop.locator('.bridge-proof-terminal').getAttribute('data-active-step') !== manuallyPausedStep, 'Play resumes the terminal sequence after focus and hover leave')

  const motionStart = await desktop.locator('.bridge-map-flow').first().evaluate((node) => ({ dashOffset: getComputedStyle(node).strokeDashoffset, playState: getComputedStyle(node).animationPlayState }))
  await desktop.waitForTimeout(450)
  const motionEnd = await desktop.locator('.bridge-map-flow').first().evaluate((node) => getComputedStyle(node).strokeDashoffset)
  check('bridge-lines-animate', motionStart.playState === 'running' && motionStart.dashOffset !== motionEnd, JSON.stringify({ start: motionStart, end: motionEnd }))

  const aurora = await desktop.locator('agentskit-aurora').evaluate((node) => ({ position: getComputedStyle(node).position, pointerEvents: getComputedStyle(node).pointerEvents }))
  check('aurora-is-decorative-layer', aurora.position === 'fixed' && aurora.pointerEvents === 'none', JSON.stringify(aurora))
  await desktop.locator('button[aria-label="Ask Doc Bridge"]').click()
  await desktop.getByRole('dialog', { name: 'Ask Doc Bridge' }).waitFor({ state: 'visible', timeout: 10000 })
  await desktop.keyboard.press('Escape')
  await desktop.getByRole('dialog', { name: 'Ask Doc Bridge' }).waitFor({ state: 'detached', timeout: 5000 })
  check('chat-open-and-escape-close', true, 'Dialog opened and closed with Escape')

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' })
  mobile.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  mobile.on('pageerror', (error) => consoleErrors.push(error.message))
  const mobileResponse = await mobile.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 })
  await mobile.waitForTimeout(500)
  const mobileMetrics = await mobile.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, aurora: Boolean(document.querySelector('agentskit-aurora')) }))
  check('mobile-http', mobileResponse?.ok() === true, `HTTP ${mobileResponse?.status()}`)
  check('mobile-no-overflow', mobileMetrics.scrollWidth <= mobileMetrics.width, `${mobileMetrics.scrollWidth}px content in ${mobileMetrics.width}px viewport`)
  const mobileBridge = await mobile.evaluate(() => ({ sideCount: document.querySelectorAll('.bridge-map-side').length, lines: getComputedStyle(document.querySelector('.bridge-map-lines')).display, order: Array.from(document.querySelector('.bridge-map-canvas').children).filter((node) => node.matches('.bridge-map-side, .bridge-map-core')).map((node) => node.className) }))
  check('mobile-bridge-stacks-without-lines', mobileBridge.sideCount === 2 && mobileBridge.lines === 'none' && mobileBridge.order.join(',') === 'bridge-map-side,bridge-map-core,bridge-map-side', JSON.stringify(mobileBridge))
  check('mobile-aurora-and-tour', mobileMetrics.aurora && await mobile.locator('agentskit-ecosystem[data-visual="agentskit-home"]').count() === 1, JSON.stringify({ aurora: mobileMetrics.aurora }))
  const menuButton = mobile.getByRole('button', { name: 'Open navigation menu' })
  await menuButton.focus()
  await mobile.keyboard.press('Enter')
  check('mobile-navigation-opens', await mobile.getByRole('navigation', { name: 'Doc Bridge navigation' }).getByRole('link', { name: 'Docs', exact: true }).isVisible(), 'Mobile docs link visible')
  await mobile.keyboard.press('Escape')
  check('mobile-navigation-escape', await mobile.getByRole('button', { name: 'Open navigation menu' }).getAttribute('aria-expanded') === 'false', 'Escape closes the product menu')
  await mobile.getByRole('button', { name: 'Ask Doc Bridge' }).click()
  const mobileDialog = mobile.getByRole('dialog', { name: 'Ask Doc Bridge' })
  await mobileDialog.waitFor({ state: 'visible', timeout: 10000 })
  const dialogBounds = await mobileDialog.evaluate((node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth } })
  check('mobile-chat-fits', dialogBounds.left >= 0 && dialogBounds.right <= dialogBounds.viewport, JSON.stringify(dialogBounds))
  await mobile.keyboard.press('Escape')
  await mobileDialog.waitFor({ state: 'detached', timeout: 5000 })
  check('mobile-chat-keyboard-close', true, 'Chat dialog closes with Escape')
  await screenshot(mobile, 'mobile-home', { width: 390, height: 844 })

  const narrow = await browser.newPage({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await narrow.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 })
  const narrowMetrics = await narrow.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  check('narrow-mobile-no-overflow', narrowMetrics.scrollWidth <= narrowMetrics.width, `${narrowMetrics.scrollWidth}px content in ${narrowMetrics.width}px viewport`)

  await mobile.goto(`${baseURL}/docs/getting-started`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await mobile.locator('body').waitFor({ state: 'visible' })
  const docsData = await mobile.evaluate(() => ({ hasHome: Boolean(document.querySelector('.bridge-home')), wordmark: Boolean(document.querySelector('.ak-product-wordmark')), homeTour: Boolean(document.querySelector('agentskit-ecosystem[data-visual="agentskit-home"]')), title: document.title }))
  check('docs-remain-calm', !docsData.hasHome && docsData.wordmark && !docsData.homeTour, JSON.stringify(docsData))

  const motion = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await motion.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 })
  const motionState = await motion.evaluate(() => ({ animation: getComputedStyle(document.querySelector('.bridge-map-flow')).animationDuration }))
  check('reduced-motion', Number.parseFloat(motionState.animation) < 0.01, JSON.stringify(motionState))
  const terminalStepBefore = await motion.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  const terminalState = await motion.locator('.bridge-proof-terminal-state').textContent()
  await motion.waitForTimeout(1800)
  const terminalStepAfter = await motion.locator('.bridge-proof-terminal').getAttribute('data-active-step')
  check('proof-terminal-reduced-motion', terminalState?.trim() === 'Manual' && terminalStepBefore === terminalStepAfter, JSON.stringify({ terminalState, terminalStepBefore, terminalStepAfter }))

  check('console-and-network', consoleErrors.length === 0 && failedRequests.length === 0, JSON.stringify({ consoleErrors, failedRequests, cancelledPrefetches: cancelledRequests }))
} catch (error) {
  failures.push(error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  await browser?.close()
}

const report = {
  status: failures.length === 0 ? 'passed' : 'failed',
  capability: 'real-browser',
  baseURL,
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceStatusHash: createHash('sha256').update(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })).digest('hex'),
  screenshots,
  cancelledRequests,
  criteria: results,
  failures,
}
writeFileSync(resolve(outputDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
if (failures.length) process.exitCode = 1
