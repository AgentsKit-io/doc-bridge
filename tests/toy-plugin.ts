import { entityId, relationId } from '../src/discovery/identity.js'
import { parseMarkdownDocument } from '../src/discovery/markdown.js'
import { sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import type { DiscoveryPluginV2, ExtractionV2, Resolution } from '../src/plugins/contract.js'
import type { Evidence } from '../src/schemas/knowledge.js'
import { surfaceFactEntityId, surfaceFactFromEntity, surfaceFactToEntity, packageFactFromEntity } from '../src/storage/facts.js'

export const toyLimits = { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024, maxFileBytes: 64 * 1024 * 1024, maxTimeMs: 60_000, maxMemoryMb: 2048 }
const capabilities = ['manifest', 'lockfile', 'versions', 'release-map', 'symbols', 'cli-commands', 'cli-flags', 'config-keys', 'signatures'] as const
const manifest = { contractVersion: 2 as const, id: 'toy-source', version: '1.0.0', knowledgeSchemaVersion: 1 as const, pipelineMajor: 1, languages: ['toy'], capabilities: [...capabilities], inputPatterns: ['toy.manifest', 'toy.lock', '**/*.toy'], unsupportedConstructs: ['unknown directives'], resourceLimits: toyLimits }
const resolved = <T>(value: T): Resolution<T> => ({ status: 'resolved', value, evidence: [] })
const unresolved = (reason: string): Resolution<never> => ({ status: 'unresolved', reason, evidence: [] })
const version = (value: string) => /^(0|[1-9]\d{0,8})$/.test(value) ? Number(value) : undefined
const validPurl = (purl: string) => /^pkg:generic\/[a-z][a-z0-9-]*$/.test(purl)

/** Test-only grammar; version and range semantics belong to the adapter. */
export const toySourcePlugin: DiscoveryPluginV2 = {
  manifest,
  async discover(input) {
    const output: ExtractionV2 = { entities: [], relations: [], facts: [], packages: [], coverage: [], diagnostics: [] }
    const request = { partition: input.read.partition, signal: input.signal }
    const listing = await input.read.list({ ...request, under: '.', include: manifest.inputPatterns, exclude: [] })
    if (listing.status !== 'ok') throw new Error(listing.code)
    let complete = listing.value.complete
    const proofs: Evidence[] = []
    let packageName = '', packageVersion = ''
    const dependencies: { purl: string; range: string; lockedVersion?: string }[] = []
    const locked = new Map<string, string>()
    for (const entry of listing.value.entries.filter(entry => entry.path === 'toy.manifest' || entry.path === 'toy.lock' || entry.path.endsWith('.toy')).sort((a,b) => a.path.localeCompare(b.path))) {
      const result = await input.read.read({ ...request, path: entry.path, ...(entry.content ? { expected: entry.content } : {}) })
      if (result.status !== 'ok') throw new Error(result.code)
      const text = Buffer.from(result.value.bytes).toString('utf8')
      const evidence = (line?: number): Evidence => ({ source: entry.path.endsWith('.toy') ? 'code' : 'configuration', path: entry.path, contentHash: result.value.content.hash, ...(line ? { lineStart: line, lineEnd: line } : {}) })
      proofs.push(evidence())
      const ownerId = entityId('module', entry.path)
      if (entry.path.endsWith('.toy')) output.entities.push({ id: ownerId, kind: 'module', name: entry.path, path: entry.path, provenance: 'observed', evidence: [evidence()] })
      for (const [offset, line] of text.trimEnd().split('\n').entries()) {
        const [directive, name, ...values] = line.trim().split(/\s+/)
        if (!name) { complete = false; continue }
        if (entry.path === 'toy.manifest' && directive === 'package' && values.length === 1 && validPurl(`pkg:generic/${name}`) && version(values[0]!) !== undefined) { packageName = name; packageVersion = values[0]!; continue }
        if (entry.path === 'toy.manifest' && directive === 'requires' && values.length === 1 && validPurl(`pkg:generic/${name}`) && /^vers:toy\/((>=|<=|>|<|=)\d+)(\|((>=|<=|>|<|=)\d+))*$/.test(values[0]!)) { dependencies.push({ purl: `pkg:generic/${name}`, range: values[0]! }); continue }
        if (entry.path === 'toy.lock' && directive === 'locked' && values.length === 1 && version(values[0]!) !== undefined) { locked.set(`pkg:generic/${name}`, values[0]!); continue }
        const kind = ({ symbol: 'symbol', command: 'cli-command', flag: 'cli-flag', config: 'config-key', signature: 'signature' } as const)[directive as 'symbol']
        if (!entry.path.endsWith('.toy') || !kind || ((kind === 'symbol' || kind === 'cli-command') ? values.length !== 0 : values.length !== 1)) { complete = false; continue }
        const factName = kind === 'cli-flag' ? values[0]! : name
        const factOwner = kind === 'cli-flag' ? surfaceFactEntityId('cli-command', ownerId, name) : ownerId
        output.facts.push({ kind, id: surfaceFactEntityId(kind, factOwner, factName), ownerId: factOwner, name: factName, valueHash: sha256NormalizedV1(line.trim()), evidence: [evidence(offset + 1)] })
      }
    }
    // Commands must exist as owners before the registry validates flag facts.
    const commandFacts = output.facts.filter(fact => fact.kind === 'cli-command')
    output.entities.push(...commandFacts.map(surfaceFactToEntity))
    output.facts.splice(0, output.facts.length, ...output.facts.filter(fact => fact.kind !== 'cli-command'))
    if (!packageName) throw new Error('MISSING_MANIFEST')
    const packageEvidence = proofs.filter(item => !item.path.endsWith('.toy'))
    output.packages.push({ id: entityId('package', packageName), purl: `pkg:generic/${packageName}`, version: packageVersion, dependencies: dependencies.map(dependency => ({ ...dependency, ...(locked.has(dependency.purl) ? { lockedVersion: locked.get(dependency.purl)! } : {}) })), evidence: packageEvidence })
    for (const scope of capabilities) output.coverage.push({ analyzer: manifest.id, scope, status: complete ? 'complete' : 'partial', evidence: proofs, ...(!complete ? { reason: 'UNSUPPORTED_DIRECTIVE_OR_PARTIAL_LIST' } : {}) })
    return output
  },
  normalizeVersion(purl, value) { return validPurl(purl) && version(value) !== undefined ? resolved(value) : unresolved('INVALID_VERSION') },
  compareVersions(purl, left, right) {
    const a = version(left), b = version(right)
    return validPurl(purl) && a !== undefined && b !== undefined ? resolved(a < b ? -1 : a > b ? 1 : 0) : unresolved('INVALID_VERSION')
  },
  satisfiesRange(purl, value, range) {
    const n = version(value)
    if (!validPurl(purl) || n === undefined || !range.startsWith('vers:toy/')) return unresolved('INVALID_RANGE')
    const clauses = range.slice('vers:toy/'.length).split('|').map(clause => /^(>=|<=|>|<|=)(\d+)$/.exec(clause))
    if (clauses.some(clause => !clause || version(clause[2]!) === undefined)) return unresolved('INVALID_RANGE')
    return resolved(clauses.every(clause => { const bound = Number(clause![2]); return ({ '>=': n >= bound, '<=': n <= bound, '>': n > bound, '<': n < bound, '=': n === bound })[clause![1] as '>='] }))
  },
  async mapRelease({ event, packages }) {
    const match = /^([a-z][a-z0-9-]*)-v(\d+)$/.exec(event.tag)
    if (!match || version(match[2]!) === undefined) return unresolved('UNMATCHED_RELEASE')
    const matches = packages.filter(pkg => pkg.purl === `pkg:generic/${match[1]}`)
    if (matches.length !== 1) return { status: 'unresolved', reason: matches.length ? 'AMBIGUOUS_RELEASE' : 'UNMATCHED_RELEASE', evidence: event.evidence }
    return { status: 'resolved', value: [{ purl: matches[0]!.purl, version: match[2]! }], evidence: event.evidence }
  },
}

/** Only generic fact identities cross into documentation relations. */
export const toyDocumentationPlugin: DiscoveryPluginV2 = {
  manifest: { ...manifest, id: 'zz-toy-documentation', languages: ['markdown'], capabilities: ['markdown'], inputPatterns: ['**/*.md'], unsupportedConstructs: [] },
  async discover(input) {
    const relations: ExtractionV2['relations'] = []
    const facts = input.resolution.entities.filter(entity => entity.metadata?.factCodecVersion === 1).map(entity => {
      if (entity.kind !== 'package') return surfaceFactFromEntity(entity)
      const pkg = packageFactFromEntity(entity)
      return { kind: 'package' as const, id: pkg.id, ownerId: pkg.id, name: pkg.purl, evidence: pkg.evidence }
    })
    for (const doc of input.resolution.entities.filter(entity => entity.kind === 'document' && entity.path)) {
      const result = await input.read.read({ partition: input.read.partition, signal: input.signal, path: doc.path! })
      if (result.status !== 'ok') throw new Error(result.code)
      const parsed = parseMarkdownDocument(doc.path!, Buffer.from(result.value.bytes).toString('utf8'))
      for (const fact of facts) {
        const candidates = facts.filter(item => item.kind === fact.kind && item.name === fact.name)
        if (candidates.length !== 1) continue
        const tokens = parsed.codeTokens.filter(token => token.value === fact.name)
        if (!tokens.length) continue
        relations.push({ id: relationId(doc.id, 'mentions-symbol', fact.ownerId, `${fact.kind}:${fact.name}`), kind: 'mentions-symbol', from: doc.id, to: fact.ownerId, provenance: 'observed', metadata: fact.kind === 'symbol' ? { symbol: fact.name } : { factKind: fact.kind, factName: fact.name }, evidence: tokens.slice(0, 8).map(token => ({ source: 'documentation', path: doc.path!, lineStart: token.line, lineEnd: token.line, contentHash: result.value.content.hash })) })
      }
    }
    return { entities: [], relations, facts: [], packages: [], diagnostics: [], coverage: [{ analyzer: 'zz-toy-documentation', scope: 'markdown', status: 'complete' }] }
  },
}
