import { readEnrichmentOverlay } from '../enrich/overlay.js'
import { parseDocBridgeIndex } from '../validate.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { setImmediate } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { loadConfig, ConfigNotFoundError, projectRootFromConfigPath } from '../config/load-config.js'
import { discoverRepositoryWithRead } from '../discovery/repository.js'
import { markdownManifest } from '../discovery/plugins/markdown.js'
import { safeWalkOptions } from '../discovery/inputs.js'
import { safeWalkFiles } from '../safety/repository.js'
import { contentRef, createLocalRepositoryRead } from '../storage/local.js'
import { buildStoredDocBridgeIndex } from '../index-builder/build-index.js'
import { renderLlmsTxt } from '../index-builder/llms-txt.js'
import { renderCapabilitiesJson } from '../index-builder/capabilities.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { diffSnapshotsWithRead } from '../diff/change-set.js'
import { parseDiscoverySnapshot } from '../validate.js'
import { toPosix } from '../lib/paths.js'
import type { ArtifactIOV1 } from '../storage/contract.js'
import type { OperationOptions } from '../storage/operation.js'

/** Opt-in async local compatibility; only a completed computation reaches publication. */
export const runOperationCli = async (argv: readonly string[], command: string): Promise<number> => {
  const value = (flag: string) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1] }
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.on('SIGINT', abort)
  const started = performance.now()
  const duration = value('--max-duration')
  const maxDurationMs = duration === undefined ? undefined : Number(duration)
  const check = async () => {
    await setImmediate()
    if (controller.signal.aborted) throw new Error('ABORTED')
    if (maxDurationMs !== undefined && performance.now() - started >= maxDurationMs) throw new Error('TIME_LIMIT')
  }
  const publish = (path: string, bytes: string) => {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}`
    try { writeFileSync(temporary, bytes); renameSync(temporary, path) } finally { rmSync(temporary, { force: true }) }
  }
  try {
    if (argv.includes('--max-duration') && (duration === undefined || !Number.isSafeInteger(maxDurationMs) || maxDurationMs! <= 0)) throw new Error('--max-duration requires a positive integer in milliseconds')
    if (argv.includes('--watch')) throw new Error('Operation controls do not support --watch')
    let root = resolve(value('--root') ?? process.cwd())
    let config
    try {
      const loaded = loadConfig({ cwd: root, ...(value('--config') ? { explicitPath: value('--config')! } : {}) })
      config = loaded.config
      if (!value('--root')) root = projectRootFromConfigPath(loaded.path, config.project?.root)
    } catch (error) { if (!(error instanceof ConfigNotFoundError) || value('--config') || command === 'index') throw error }
    const limits = { ...markdownManifest.resourceLimits }
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) limits[key] = Math.min(limits[key], (key === 'maxFileBytes' ? undefined : config?.safety?.[key]) ?? limits[key])
    const listing = safeWalkFiles(root, { ...safeWalkOptions(config), ...limits })
    await check()
    if (listing.incomplete) throw new Error(listing.reason ?? 'FILE_LIMIT')
    const inventory: Record<string, ReturnType<typeof contentRef>> = {}
    const budget = { used: 0 }
    for (const path of listing.files) {
      await check()
      const bytes = Buffer.from(readBoundedText(path, budget, { maxFileBytes: limits.maxFileBytes, maxCorpusBytes: limits.maxBytes }))
      inventory[toPosix(relative(root, path))] = contentRef(bytes)
    }
    const headPath = value('--head')
    const head = headPath ? parseDiscoverySnapshot(JSON.parse(await readFile(resolve(headPath), 'utf8'))) : undefined
    const partition = { repositoryId: 'repository', revision: head?.sourceRevision ?? sha256NormalizedV1(inventory) }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory, excludes: safeWalkOptions(config).exclude ?? [] })
    const controls = (): OperationOptions => ({ signal: controller.signal, collectMetrics: argv.includes('--progress'), ...(maxDurationMs === undefined ? {} : { maxDurationMs: Math.max(1, Math.ceil(maxDurationMs - (performance.now() - started))) }), ...(argv.includes('--progress') ? { onProgress: event => process.stderr.write(`${event.stage}: ${event.processed}${event.total === undefined ? '' : '/' + event.total} (${Math.round(event.elapsedMs)} ms)\n`) } : {}) })
    await check()
    const captured = head ? undefined : await discoverRepositoryWithRead(repository, { root, ...(config ? { config } : {}), ...controls() })
    await check()
    if (captured?.metrics) process.stderr.write(`metrics: ${JSON.stringify(captured.metrics)}\n`)
    if (captured?.status) { const { metrics: _metrics, ...partial } = captured; process.stdout.write(JSON.stringify(partial) + '\n'); return 2 }
    const snapshot = head ?? captured!.snapshot
    if (command === 'discover') {
      process.stdout.write(argv.includes('--text') ? `Project: ${snapshot.project.name}\nEntities: ${snapshot.entities.length}\nRelations: ${snapshot.relations.length}\nSource revision: ${snapshot.sourceRevision}\n` : JSON.stringify({ ok: true, snapshot }, null, 2) + '\n')
      return 0
    }
    if (command === 'diff') {
      const basePath = value('--base')
      if (!basePath) throw new Error('diff requires --base <snapshot.json>')
      const base = parseDiscoverySnapshot(JSON.parse(await readFile(resolve(basePath), 'utf8')))
      const result = await diffSnapshotsWithRead(base, snapshot, repository, { ...controls(), policy: !argv.includes('--no-policy') })
      await check()
      const { metrics, ...artifact } = result
      if (metrics) process.stderr.write(`metrics: ${JSON.stringify(metrics)}\n`)
      const bytes = JSON.stringify(artifact, null, 2) + '\n'
      if (result.status) { process.stdout.write(bytes); return 2 }
      if (value('--output')) publish(resolve(value('--output')!), bytes)
      process.stdout.write(bytes); return 0
    }
    const artifacts: ArtifactIOV1 = { version: 1, partition, limits,
      read: async () => ({ status: 'missing', code: 'NOT_FOUND' }), list: async () => ({ status: 'ok', value: [] }), replaceAtomic: async () => ({ status: 'denied', code: 'PATH_DENIED' }),
    }
    const overlay = config!.intelligence?.registry?.enabled ? readEnrichmentOverlay(root) : undefined
    const built = await buildStoredDocBridgeIndex({ repository, artifacts, partition, signal: controller.signal, config: config!, snapshot, ...(captured ? { snapshotBinding: captured.binding } : {}), write: false, ...(overlay ? { overlay } : {}), ...controls() })
    await check()
    if (built.status !== 'ok') { const { metrics: _metrics, ...partial } = built; process.stdout.write(JSON.stringify(partial) + '\n'); return 2 }
    if (built.value.metrics) process.stderr.write(`metrics: ${JSON.stringify(built.value.metrics)}\n`)
    if (built.value.limitations.length) throw new Error('Incomplete index acquisition')
    const index = built.value.index
    const out = config!.index?.outFile ?? '.doc-bridge/index.json'
    const indexPath = join(root, out)
    try {
      const prior = parseDocBridgeIndex(JSON.parse(readBoundedText(indexPath, { used: 0 }, { maxFileBytes: limits.maxFileBytes, maxCorpusBytes: limits.maxBytes })))
      if (prior.contentHash === index.contentHash) index.generatedAt = prior.generatedAt
    } catch { /* An absent or invalid prior artifact cannot supply run provenance. */ }
    const exports = [[indexPath, JSON.stringify(index, null, 2) + '\n']]
    const llms = config!.index?.llmsTxt?.enabled !== false ? config!.index?.llmsTxt?.outFile ?? 'llms.txt' : undefined
    if (llms) exports.push([join(root, llms), renderLlmsTxt(config!, index.knowledge, index.project?.name ?? 'project', { root })])
    if (config!.index?.capabilities?.enabled !== false) exports.push([join(root, config!.index?.capabilities?.outFile ?? '.doc-bridge/capabilities.json'), renderCapabilitiesJson(config!, index, { index: toPosix(out), ...(llms ? { llmsTxt: toPosix(llms) } : {}) })])
    await check()
    for (const [path, bytes] of exports) publish(path!, bytes!)
    process.stdout.write(JSON.stringify({ ok: true, indexPath, contentHash: index.contentHash }, null, 2) + '\n')
    return 0
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Operation failed'}\n`); return 2 }
  finally { process.off('SIGINT', abort) }
}
