import { runCommand, toPosix } from '@agentskit/cross-platform'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { ConfigNotFoundError, loadCliConfig } from '../config/load-config.js'
import { parseDocBridgeIndex, parseDiscoverySnapshot } from '../validate.js'
import { discoverRepositoryWithRead } from '../discovery/repository.js'
import { markdownManifest } from '../discovery/plugins/markdown.js'
import { diffSnapshotsWithRead } from '../diff/change-set.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { sameHashIdentity } from '../index-builder/content-hash.js'
import { runGate, runGates, resolveGateIds, type GateId } from '../gates/run-gates.js'
import { denyServiceOperation, withExecutionProfile } from '../execution/profile.js'
import { serviceConfig } from '../execution/config.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { DEFAULT_SAFETY_EXCLUDES, containedPath, safeWalkFiles, redactSecrets, redactValue } from '../safety/repository.js'
import { contentRef, createLocalRepositoryRead } from '../storage/local.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'

const revisionPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u
const modes = ['committed', 'ci-built']
const value = (argv: readonly string[], name: string) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1] }
const required = (argv: readonly string[], name: string) => { const result = value(argv, name); if (!result || result.startsWith('--')) throw new Error(`Missing ${name}`); return result }
const json = (input: unknown) => `${JSON.stringify(input, null, 2)}\n`
const save = (path: string, data: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data) }
const outside = (root: string, path: string) => {
  const target = resolve(path)
  let ancestor = target
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const canonical = resolve(realpathSync(ancestor), relative(ancestor, target))
  const rel = relative(realpathSync(root), canonical)
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) throw new Error('Artifact destination must be outside the checkout')
  return canonical
}
const revision = (input: string) => { if (!revisionPattern.test(input)) throw new Error('Use an exact Git commit hash'); return input }
const mode = (input = 'committed') => { if (!modes.includes(input)) throw new Error('index-source must be committed or ci-built'); return input }
const git = async (root: string, args: string[]) => {
  const configured = await runCommand('git', ['config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], { cwd: root, maxOutputBytes: 65536, timeoutMs: 60000 })
  if (![0, 1].includes(configured.code!) || configured.truncated) throw new Error('Git filter inventory unavailable')
  const filters = [...new Set(configured.stdout.split('\0').filter(Boolean))]
  if (filters.length > 128) throw new Error('Git filter inventory exceeds budget')
  const disabled = filters.flatMap(key => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`])
  const result = await runCommand('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...disabled, ...args], { cwd: root, maxOutputBytes: 4 * 1024 * 1024, timeoutMs: 60000 })
  if (result.code !== 0 || result.truncated) throw new Error('Git provenance unavailable')
  return result.stdout.trim()
}
const exactHead = async (root: string, sha: string) => {
  if (await git(root, ['rev-parse', 'HEAD']) !== revision(sha) || await git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Analysis requires a clean checkout of the declared exact revision')
}
const staticConfig = (root: string, argv: readonly string[], service = false) => {
  const loaded = loadCliConfig({ cwd: root, ...(service ? { profile: 'service' } : {}), ...(value(argv, '--config') ? { explicitPath: value(argv, '--config')! } : {}) })
  if (!containedPath(root, loaded.path)) throw new Error('Configuration path escapes the checkout')
  return loaded
}

/** Service reads never honour executable, agent, network or repository-module configuration. */
const capture = async (root: string, sha: string, config: DocBridgeConfigV1) => withExecutionProfile('service', async () => {
  await exactHead(root, sha)
  const ceilings = markdownManifest.resourceLimits
  const limits = { ...ceilings, maxFiles: Math.min(config.safety?.maxFiles ?? ceilings.maxFiles, ceilings.maxFiles), maxBytes: Math.min(config.safety?.maxBytes ?? ceilings.maxBytes, ceilings.maxBytes), maxTimeMs: Math.min(config.safety?.maxTimeMs ?? ceilings.maxTimeMs, ceilings.maxTimeMs), maxMemoryMb: Math.min(config.safety?.maxMemoryMb ?? ceilings.maxMemoryMb, ceilings.maxMemoryMb) }
  const excludes = ['**/.git', ...DEFAULT_SAFETY_EXCLUDES, ...(config.safety?.exclude ?? [])]
  const listing = safeWalkFiles(root, { ...limits, exclude: excludes })
  if (listing.incomplete) throw new Error(listing.reason)
  const budget = { used: 0 }
  const inventory = Object.fromEntries(listing.files.map(path => [toPosix(relative(root, path)), contentRef(Buffer.from(readBoundedText(path, budget, { maxFileBytes: limits.maxFileBytes, maxCorpusBytes: limits.maxBytes })))]))
  return createLocalRepositoryRead({ root, partition: { repositoryId: 'repository', revision: sha }, limits, inventory, excludes })
})
const escape = (text: string, limit = 500) => redactSecrets(text).replace(/[^\x20-\x7e]|[&<>`*_\[\]\\!|#@]/gu, character => `&#${character.codePointAt(0)};`).slice(0, limit)

export const runActionCli = async (argv: readonly string[]): Promise<number> => {
  try {
    const root = realpathSync(resolve(value(argv, '--root') ?? process.cwd()))
    if (argv[0] === 'index') {
      denyServiceOperation('Action blocking gates')
      const source = mode(value(argv, '--index-source'))
      const sha = revision(required(argv, '--revision'))
      await exactHead(root, sha)
      const loaded = staticConfig(root, argv)
      const config = loaded.config
      const gateRoot = dirname(loaded.path)
      const selected = value(argv, '--gate')
      const ids = selected ? [selected as GateId] : resolveGateIds(config)
      const committedPath = resolve(gateRoot, config.index?.outFile ?? '.doc-bridge/index.json')
      // Always observe committed drift before a build; policy determines whether it blocks.
      const committed = source === 'committed' || existsSync(committedPath) ? runGate(gateRoot, config, 'index-freshness') : undefined
      let generated: { path: string; contentHash: string; reproducible: boolean } | undefined
      let gates
      if (source === 'committed') gates = runGates(gateRoot, config, ids)
      else {
        const output = outside(root, required(argv, '--output'))
        const first = buildDocBridgeIndex({ root: gateRoot, config, write: false }).index
        save(output, json(first))
        const second = buildDocBridgeIndex({ root: gateRoot, config, write: false }).index
        await exactHead(root, sha)
        const persisted = parseDocBridgeIndex(JSON.parse(readFileSync(output, 'utf8')))
        const reproducible = sameHashIdentity(first, persisted) && sameHashIdentity(persisted, second)
        generated = { path: output, contentHash: first.contentHash, reproducible }
        const results = ids.map(id => id === 'index-freshness' || id === 'index-reproducible'
          ? { id, ok: reproducible && (id !== 'index-freshness' || committed?.ok !== false), message: id === 'index-freshness' && committed?.ok === false ? 'Committed index drift remains blocking; CI output does not repair it' : 'CI-built index repeat hash and exact-revision provenance checked' }
          : runGate(gateRoot, config, id))
        gates = { ok: reproducible && results.every(result => result.ok), results }
        save(`${output}.provenance.json`, json({ schemaVersion: 1, source, sourceRevision: sha, generated }))
      }
      const report = { source, sourceRevision: sha, committed: committed ?? { present: false }, ...(generated ? { generated } : {}), ...gates }
      process.stdout.write(json(redactValue(report)))
      if (value(argv, '--report')) save(outside(root, value(argv, '--report')!), json(redactValue(report)))
      return gates.ok ? 0 : 1
    }
    if (argv[0] === 'snapshot') {
      const sha = revision(required(argv, '--revision'))
      const filtered = serviceConfig(staticConfig(root, argv, true).config)
      const read = await capture(root, sha, filtered.config)
      const { snapshot } = await discoverRepositoryWithRead(read, { profile: 'service', config: filtered.config, sourceRevisionKind: 'git' })
      await exactHead(root, sha)
      save(outside(root, required(argv, '--output')), json(snapshot))
      return 0
    }
    throw new Error('Usage: ak-docs action index|snapshot --revision <sha> --root <checkout> --output <outside-artifact>')
  } catch (error) {
    const message = error instanceof ConfigNotFoundError ? 'No doc-bridge config found — run ak-docs init or pass config-path.' : redactSecrets(error instanceof Error ? error.message : 'Action analysis failed').slice(0, 1000)
    process.stderr.write(`${message}\n`)
    if (argv[0] === 'index' && value(argv, '--report')) {
      try { save(outside(realpathSync(resolve(value(argv, '--root') ?? process.cwd())), value(argv, '--report')!), json({ ok: false, error: message })) } catch { /* Preserve the original failure if the artifact destination is invalid. */ }
    }
    return 2
  }
}

/** The advisory variant of ak-docs diff uses the same core diff with service-bound head reads. */
export const runAdvisoryDiff = async (argv: readonly string[]): Promise<number> => {
  try {
    const root = realpathSync(resolve(required(argv, '--root')))
    const load = (name: string) => parseDiscoverySnapshot(JSON.parse(readBoundedText(required(argv, name), { used: 0 }, { maxFileBytes: 32 * 1024 * 1024, maxCorpusBytes: 64 * 1024 * 1024 })))
    const base = load('--base')
    const head = load('--head')
    revision(base.sourceRevision); revision(head.sourceRevision)
    const source = mode(value(argv, '--index-source'))
    const repository = required(argv, '--repository')
    const pr = Number(required(argv, '--pr'))
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) || repository.length > 256 || !Number.isSafeInteger(pr) || pr < 1) throw new Error('Invalid repository/PR binding')
    const config = serviceConfig(staticConfig(root, argv, true).config).config
    const read = await capture(root, head.sourceRevision, config)
    const diff = await diffSnapshotsWithRead(base, head, read, { profile: 'service' })
    await exactHead(root, head.sourceRevision)
    const findings = diff.findings.filter(finding => ['BROKEN_REFERENCE', 'AMBIGUOUS_REFERENCE'].includes(finding.code))
    const marker = `<!-- doc-bridge:advisory:v1:${repository}:${pr} -->`
    const binding = `<!-- doc-bridge:revisions:${base.sourceRevision}:${head.sourceRevision}:${source} -->`
    const lines = [marker, binding, '## Doc Bridge advisory (Layer 1)', '', `Repository: ${repository}; PR: ${pr}.`, `Base: ${base.sourceRevision}; head: ${head.sourceRevision}; index source: ${source}.`, '', 'Advisory only. Blocking gates are reported independently; interpretation and acceptance remain human-owned.', '', `Findings: ${findings.length}.`]
    for (const finding of findings.slice(0, 30)) {
      const locations = [...new Set(finding.evidence.filter(item => item.source === 'documentation').map(item => `${item.context ?? 'Citation'}: ${item.path}${item.lineStart ? `:${item.lineStart}` : ''}`))].slice(0, 3)
      lines.push(`- **${finding.code}** (${finding.status}): ${escape(finding.message)} Evidence: ${locations.map(location => escape(location, 150)).join(', ')}.`)
    }
    if (findings.length > 30) lines.push(`- ${findings.length - 30} additional findings in the diff artifact.`)
    const gaps = [...new Map(diff.changeSet.coverage.filter(item => item.status !== 'complete' && item.status !== 'not-applicable' && !item.analyzer.endsWith('service-profile')).map(item => [JSON.stringify({ ...item, analyzer: item.analyzer.replace(/^(base|head):/u, '') }), item])).values()]
    const counts = [...new Set(gaps.map(item => item.status))].sort().map(status => `${status}: ${gaps.filter(item => item.status === status).length}`)
    lines.push('', `Coverage gaps / policy exclusions: ${counts.join('; ') || 'none'}.`, 'Analysis ran under the service profile; full coverage detail is in the diff artifact.')
    const scopes = new Set<string>(diff.changeSet.changes.map(change => change.kind))
    const capabilities: Record<string, string> = { symbols: 'symbol', signatures: 'signature', 'cli-commands': 'cli-command', 'cli-flags': 'cli-flag', 'config-keys': 'config-key', manifest: 'package' }
    for (const gap of gaps.filter(item => scopes.has(capabilities[item.scope] ?? item.scope)).slice(0, 5)) lines.push(`- ${escape(gap.scope)}: ${gap.status}; ${escape((gap.reason ?? 'No reason provided').replace(/[.\s]+$/u, ''))}.`)
    lines.push('', 'Policy routing and version exclusions are not applied by this advisory; all deterministic reference findings are shown, including historical/generated documents. No edits are proposed.', '')
    const markdown = lines.join('\n')
    if (Buffer.byteLength(markdown) > 60000) throw new Error('Advisory Markdown exceeds the comment budget')
    const output = outside(root, required(argv, '--output'))
    save(output, json({ schemaVersion: 1, repository, pr, base: base.sourceRevision, head: head.sourceRevision, source, marker, markdown, findingCount: findings.length }))
    save(`${output}.diff.json`, json(diff))
    save(`${output}.md`, markdown)
    const summary = value(argv, '--summary')
    if (summary) appendFileSync(summary, markdown)
    process.stdout.write(markdown)
    return argv.includes('--fail-on-findings') && findings.length > 0 ? 1 : 0
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Advisory diff failed'}\n`); return 2 }
}
