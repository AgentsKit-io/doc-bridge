import { relative, resolve } from 'node:path'
import { loadCliConfig } from '../config/load-config.js'
import { discoverRepositoryWithRead } from '../discovery/repository.js'
import { markdownManifest } from '../discovery/plugins/markdown.js'
import { buildStoredDocBridgeIndex } from '../index-builder/build-index.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { toPosix } from '../lib/paths.js'
import { safeWalkFiles, DEFAULT_SAFETY_EXCLUDES, redactValue } from '../safety/repository.js'
import { createLocalRepositoryRead, contentRef } from '../storage/local.js'
import { createLocalArtifactIO } from '../storage/artifacts.js'
import type { ArtifactIOV1 } from '../storage/contract.js'
import { startMcpStdioServer } from '../mcp/server.js'
import { searchIndex } from '../query/search.js'
import { withExecutionProfile, serviceCoverage } from '../execution/profile.js'

export const runServiceCli = (argv: readonly string[]): Promise<number> => withExecutionProfile('service', async () => {
  const value = (name: string): string | undefined => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1] }
  const command = argv[0]
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.on('SIGINT', abort)
  try {
    if (argv.includes('--watch')) throw new Error('not-analyzed: service profile denies watch')
    const supported = ['validate-config', 'discover', 'index', 'search', 'mcp']
    if (!supported.includes(command ?? '')) throw new Error('not-analyzed: command unavailable in service profile; supported: ' + supported.join(', '))
    const artifactRoot = value('--artifact-root')
    if (command === 'index' && !artifactRoot) throw new Error('Service index writes require caller-provided --artifact-root <directory>')
    const root = resolve(value('--root') ?? process.cwd())
    const configPath = value('--config')
    const loaded = loadCliConfig({ cwd: root, profile: 'service', ...(configPath ? { explicitPath: configPath } : {}) })
    const config = loaded.config
    const diagnostics = loaded.diagnostics ?? []
    const limitations = serviceCoverage(diagnostics)
    for (const path of diagnostics) process.stderr.write(`service-profile: ignored ${path}\n`)
    const output = (payload: unknown): void => { process.stdout.write(`${JSON.stringify(redactValue(payload), null, 2)}\n`) }
    if (command === 'validate-config') { output({ ok: true, schemaVersion: config.schemaVersion, diagnostics, limitations }); return 0 }
    const duration = value('--max-duration')
    const maxDurationMs = duration === undefined ? undefined : Number(duration)
    if (argv.includes('--max-duration') && (duration === undefined || !Number.isSafeInteger(maxDurationMs) || maxDurationMs! <= 0)) throw new Error('--max-duration requires a positive integer in milliseconds')
    const controls = { signal: controller.signal, collectMetrics: argv.includes('--progress'), ...(maxDurationMs === undefined ? {} : { maxDurationMs }), ...(argv.includes('--progress') ? { onProgress: (event: import('../storage/operation.js').ProgressEvent) => process.stderr.write(`${event.stage}: ${event.processed} (${Math.round(event.elapsedMs)} ms)\n`) } : {}) }
    const ceilings = markdownManifest.resourceLimits
    const limits = { ...ceilings,
      maxFiles: Math.min(config.safety?.maxFiles ?? ceilings.maxFiles, ceilings.maxFiles),
      maxBytes: Math.min(config.safety?.maxBytes ?? ceilings.maxBytes, ceilings.maxBytes),
      maxTimeMs: Math.min(config.safety?.maxTimeMs ?? ceilings.maxTimeMs, ceilings.maxTimeMs),
      maxMemoryMb: Math.min(config.safety?.maxMemoryMb ?? ceilings.maxMemoryMb, ceilings.maxMemoryMb),
    }
    const artifactPath = artifactRoot ? toPosix(relative(root, resolve(artifactRoot))) : undefined
    const artifactExcludes = artifactPath && !artifactPath.startsWith('../') && artifactPath !== '' ? [artifactPath, `${artifactPath}/**`] : []
    if (artifactPath === '') throw new Error('Service artifact root must be separate from the caller read root')
    const excludes = [...new Set([...DEFAULT_SAFETY_EXCLUDES, ...artifactExcludes, ...(config.safety?.exclude ?? [])])]
    const listing = safeWalkFiles(root, { ...limits, exclude: excludes })
    if (listing.incomplete) throw new Error(listing.reason ?? 'Incomplete caller inventory')
    const budget = { used: 0 }
    const inventory = Object.fromEntries(listing.files.map(path => [toPosix(relative(root, path)), contentRef(Buffer.from(readBoundedText(path, budget, { maxFileBytes: limits.maxFileBytes, maxCorpusBytes: limits.maxBytes })))]))
    const partition = { repositoryId: 'repository', revision: sha256NormalizedV1(inventory) }
    const repository = await createLocalRepositoryRead({ root, partition, limits, inventory, excludes })
    const discovered = await discoverRepositoryWithRead(repository, { profile: 'service', config, ...controls })
    if (discovered.metrics) process.stderr.write(`metrics: ${JSON.stringify(discovered.metrics)}\n`)
    if (discovered.status) { const { metrics: _metrics, ...partial } = discovered; output(partial); return 2 }
    if (command === 'discover') { output({ ...discovered.snapshot, limitations, diagnostics }); return 0 }
    const signal = controller.signal
    const artifacts: ArtifactIOV1 = command === 'index' ? await createLocalArtifactIO({ root: resolve(artifactRoot!), partition, limits }) : {
      version: 1, partition, limits,
      read: async () => ({ status: 'missing', code: 'NOT_FOUND' }),
      list: async () => ({ status: 'ok', value: [] }),
      replaceAtomic: async () => ({ status: 'denied', code: 'PATH_DENIED' }),
    } as ArtifactIOV1
    const built = await buildStoredDocBridgeIndex({ repository, artifacts, partition, config, snapshot: discovered.snapshot, snapshotBinding: discovered.binding, profile: 'service', write: command === 'index', ...controls })
    if (built.status === 'ok' && built.value.metrics) process.stderr.write(`metrics: ${JSON.stringify(built.value.metrics)}\n`)
    if (built.status !== 'ok') throw new Error(`not-analyzed: ${built.code}`)
    if (command === 'mcp') {
      startMcpStdioServer({ root, config, profile: 'service', loadIndex: () => built.value.index, readDocument: () => { throw new Error('not-analyzed: synchronous document text unavailable; use knowledge.search') } })
      return 0
    }
    output({ ...(command === 'search' ? { results: searchIndex(built.value.index, argv[1] ?? '') } : { index: built.value.index }), limitations: [...limitations, ...built.value.limitations], diagnostics })
    return 0
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Service operation failed'}\n`); return 2 }
  finally { process.off('SIGINT', abort) }
})
