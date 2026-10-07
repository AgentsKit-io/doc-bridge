import { readBoundedText } from '../lib/bounded-text.js'
import { withExecutionProfile, type ExecutionProfile } from '../execution/profile.js'
import { parseDocumentationDeclarations } from '../discovery/documentation.js'
import { entityId } from '../discovery/identity.js'
import { exportsOf, FILE_BACKED_KINDS } from '../discovery/incremental.js'
import { analyzeMarkdownDocument, configKeyCitationIndex, markdownPathCandidateIndex, parseMarkdownDocument, type MarkdownResolution } from '../discovery/markdown.js'
import { canonicalJsonV1, contentHashForVersionedArtifact, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { containedProjectPath } from '../lib/paths.js'
import { ChangeSetV1Schema, type Change, type ChangeSetV1 } from '../schemas/change-set.js'
import { surfaceFactFromEntity, surfaceFactEntityId, packageFactFromEntity, SurfaceFactKindSchema, type SurfaceFact } from '../storage/facts.js'
import { contentRef } from '../storage/local.js'
import type { RepositoryReadV1 } from '../storage/contract.js'
import { DiagnosticSchema, type DiscoverySnapshotV1, type Evidence, type KnowledgeEntity, type KnowledgeRelation } from '../schemas/knowledge.js'

export type SnapshotForChanges = Pick<DiscoverySnapshotV1, 'entities' | 'relations' | 'sourceRevision'>
const FACT_CAPABILITIES = { symbol: 'symbols', 'cli-command': 'cli-commands', 'cli-flag': 'cli-flags', 'config-key': 'config-keys', signature: 'signatures', package: 'manifest' } as const
const factsOf = (snapshot: SnapshotForChanges) => snapshot.entities.filter(entity => entity.metadata?.factCodecVersion === 1 && SurfaceFactKindSchema.safeParse(entity.kind).success).map(surfaceFactFromEntity)
const packagesOf = (snapshot: SnapshotForChanges) => snapshot.entities.filter(entity => entity.kind === 'package' && entity.metadata?.factCodecVersion === 1).map(packageFactFromEntity)
const factIdentity = (fact: SurfaceFact) => ({ id: fact.id, ownerId: fact.ownerId, name: fact.name, valueHash: fact.valueHash, evidence: fact.evidence })
const DOCUMENT_RELATIONS = new Set(['covers', 'mentions', 'mentions-symbol', 'links-to'])
const hashOf = (entity: KnowledgeEntity) => entity.evidence.find((item) => item.contentHash)?.contentHash
const identity = (entity: KnowledgeEntity) => ({ id: entity.id, name: entity.name, evidence: entity.evidence })

/** File deltas and per-owner export identities share the existing discovery IDs and evidence. */
export const snapshotChanges = (base: SnapshotForChanges, head: SnapshotForChanges): Change[] => {
  const entities = (snapshot: SnapshotForChanges) => new Map(snapshot.entities
    .filter((entity) => (FILE_BACKED_KINDS as readonly string[]).includes(entity.kind) && entity.path && hashOf(entity))
    .map((entity) => [entity.id, entity]))
  const before = entities(base)
  const after = entities(head)
  const changes: Change[] = []
  const oldFacts = new Map(factsOf(base).map(fact => [fact.id, fact]))
  const newFacts = new Map(factsOf(head).map(fact => [fact.id, fact]))
  const factOwners = new Set([...oldFacts.values(), ...newFacts.values()].filter(fact => fact.kind === 'symbol').map(fact => fact.ownerId))
  const oldPackages = new Map(packagesOf(base).map(pkg => [pkg.id, pkg]))
  const newPackages = new Map(packagesOf(head).map(pkg => [pkg.id, pkg]))
  const packageIdentity = (pkg: ReturnType<typeof packageFactFromEntity>) => ({ id: pkg.id, name: pkg.purl, evidence: pkg.evidence, valueHash: sha256NormalizedV1({ purl: pkg.purl, version: pkg.version, dependencies: pkg.dependencies }) })
  for (const id of new Set([...oldFacts.keys(), ...newFacts.keys(), ...oldPackages.keys(), ...newPackages.keys()])) {
    const old = oldFacts.get(id) ?? oldPackages.get(id)
    const next = newFacts.get(id) ?? newPackages.get(id)
    const asIdentity = (fact: SurfaceFact | ReturnType<typeof packageFactFromEntity>) => 'kind' in fact ? factIdentity(fact) : packageIdentity(fact)
    if (!old || !next || asIdentity(old).valueHash !== asIdentity(next).valueHash) changes.push({
      kind: (newFacts.get(id) ?? oldFacts.get(id))?.kind ?? 'package',
      op: !old ? 'added' : !next ? 'removed' : 'changed',
      ...(old ? { before: asIdentity(old) } : {}), ...(next ? { after: asIdentity(next) } : {}),
    })
  }
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id)
    const next = after.get(id)
    const entity = next ?? old!
    if (!oldPackages.has(id) && !newPackages.has(id) && (!old || !next || hashOf(old) !== hashOf(next))) changes.push({
      kind: entity.kind === 'document' ? 'doc-path' : entity.kind as 'module' | 'package',
      op: !old ? 'added' : !next ? 'removed' : 'changed',
      ...(old ? { before: identity(old) } : {}), ...(next ? { after: identity(next) } : {}),
    })
    if (entity.kind !== 'module' || factOwners.has(id)) continue
    const oldSymbols = new Set(old ? exportsOf(old) : [])
    const newSymbols = new Set(next ? exportsOf(next) : [])
    for (const symbol of new Set([...oldSymbols, ...newSymbols])) {
      if (oldSymbols.has(symbol) === newSymbols.has(symbol)) continue
      const side = newSymbols.has(symbol) ? 'after' : 'before'
      changes.push({ kind: 'symbol', op: side === 'after' ? 'added' : 'removed', [side]: {
        id: entityId('symbol', `${id}:${symbol}`), ownerId: id, name: symbol, evidence: (side === 'after' ? next! : old!).evidence,
      } })
    }
  }
  return changes.sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
}

export type ChangeImpact = { documentsToReview: { path: string; because: string }[]; changedDocumentation: { path: string; because: string }[] }
export const changeImpact = (base: SnapshotForChanges, head: SnapshotForChanges, changes: readonly Change[] = snapshotChanges(base, head)): ChangeImpact => {
  const before = new Map(base.entities.map((entity) => [entity.id, entity]))
  const after = new Map(head.entities.map((entity) => [entity.id, entity]))
  const moved = new Set(changes.flatMap((change) => [change.before?.ownerId ?? change.before?.id, change.after?.ownerId ?? change.after?.id].filter((id): id is string => !!id)))
  const changedDocs = new Set(changes.filter((change) => change.kind === 'doc-path').flatMap((change) => [change.before?.id, change.after?.id]))
  const reasons = new Map<string, Set<string>>()
  for (const relation of [...base.relations, ...head.relations]) {
    if (!DOCUMENT_RELATIONS.has(relation.kind) || !moved.has(relation.to)) continue
    const document = after.get(relation.from)
    if (!document || document.kind !== 'document' || !document.path) continue
    const target = after.get(relation.to) ?? before.get(relation.to)
    const because = reasons.get(document.id) ?? new Set<string>()
    because.add(`${relation.kind} \`${target?.path ?? relation.to}\``)
    reasons.set(document.id, because)
  }
  const entries = [...reasons].map(([id, because]) => ({ id, path: after.get(id)!.path!, because: [...because].sort().join('; ') })).sort((a, b) => a.path.localeCompare(b.path))
  return {
    documentsToReview: entries.filter((item) => !changedDocs.has(item.id)).map(({ id: _id, ...item }) => item),
    changedDocumentation: [...changedDocs].flatMap((id) => {
      const doc = id ? after.get(id) : undefined
      return doc?.path ? [{ path: doc.path, because: reasons.has(doc.id) ? [...reasons.get(doc.id)!].sort().join('; ') : 'documentation changed' }] : []
    }).sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export const changeSetContentHash = (changeSet: ChangeSetV1): string => {
  const { baseRevision: _base, headRevision: _head, ...semantic } = changeSet
  return contentHashForVersionedArtifact(semantic)
}
export const parseChangeSet = (input: unknown): ChangeSetV1 => {
  const result = ChangeSetV1Schema.parse(input)
  if (changeSetContentHash(result) !== result.contentHash) throw new Error('Invalid ChangeSetV1 semantic content hash.')
  return result
}

const resolutionFor = (base: SnapshotForChanges): MarkdownResolution => {
  const paths = (kind: string) => new Map(base.entities.filter((entity) => entity.kind === kind && entity.path).map((entity) => [entity.path!, entity.id]))
  const symbols = new Map<string, string[]>()
  for (const module of base.entities.filter((entity) => entity.kind === 'module')) for (const symbol of exportsOf(module)) symbols.set(symbol, [...(symbols.get(symbol) ?? []), module.id])
  const resolution = { documents: paths('document'), modules: paths('module'), areas: paths('area'), packages: new Map(base.entities.filter((entity) => entity.kind === 'package').map((entity) => [entity.name, entity.id])), symbols }
  return { ...resolution, pathIndex: markdownPathCandidateIndex(resolution) }
}

/** Re-read head citations against the historical resolution universe, never restore old graph edges. */
const citationsInHead = (document: KnowledgeEntity, base: DiscoverySnapshotV1, root: string, resolution: MarkdownResolution): KnowledgeRelation[] | undefined => {
  try {
    const path = containedProjectPath(root, document.path!)
    if (!path) return undefined
    // One descriptor for the size check and the read, so the file cannot change in between.
    const content = readBoundedText(path, { used: 0 }, { maxFileBytes: 1_000_000 })
    return citationsFromText(document, base, content, resolution)
  } catch { return undefined }
}

const citationsFromText = (document: KnowledgeEntity, base: DiscoverySnapshotV1, content: string, resolution: MarkdownResolution): KnowledgeRelation[] | undefined => {
  const parsed = parseMarkdownDocument(document.path!, content)
  if (parsed.contentHash !== hashOf(document)) return undefined
  const observed = analyzeMarkdownDocument(parsed, document.id, resolution)
  if (observed.truncated) return undefined
  const declared = parseDocumentationDeclarations({ path: document.path!, content }, { snapshot: base, documentId: document.id })
  return [...observed.relations, ...declared.relations].filter((relation) => relation.metadata?.confidence !== 'fuzzy')
    .map((relation) => ({ ...relation, evidence: relation.evidence.map((item) => ({ ...item, contentHash: parsed.contentHash })) }))
}

/** Completeness belongs to the extracting analyzer, not another plugin supporting the same kind. */
const extractionComplete = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, kind: keyof typeof FACT_CAPABILITIES, evidence: readonly Evidence[]): boolean => {
  const capability = FACT_CAPABILITIES[kind]
  const candidates = base.coverage.filter(entry => entry.scope === capability)
  const matching = candidates.filter(entry => entry.evidence?.some(item => evidence.some(proof => proof.path === item.path)))
  const relevant = matching.length ? matching : candidates
  return relevant.length > 0 && relevant.every(entry => {
    const current = head.coverage.filter(item => item.analyzer === entry.analyzer && (item.scope === capability || item.scope === 'plugin'))
    return current.some(item => item.scope === capability && item.status === 'complete') && current.every(item => item.status === 'complete')
  }) && !head.coverage.some(entry => entry.status !== 'complete' && entry.scope.startsWith('limits:'))
}

type DiffOptions = { headRoot?: string; branch?: string }
type VerifiedDocuments = ReadonlyMap<string, string>

const referenceFacts = (snapshot: SnapshotForChanges) => [...factsOf(snapshot), ...packagesOf(snapshot).map(pkg => ({ kind: 'package' as const, id: pkg.id, ownerId: pkg.id, name: pkg.purl, evidence: pkg.evidence }))]

const configKeyOwnerCandidates = (snapshot: DiscoverySnapshotV1, documentPath: string, name: string, facts: ReturnType<typeof referenceFacts>): string[] => {
  const packages = snapshot.entities.filter(entity => entity.kind === 'package' && entity.path).map(entity => ({ id: entity.id, path: entity.path! }))
  const matches = configKeyCitationIndex(new Map([[name, facts.filter(fact => fact.kind === 'config-key' && fact.name === name)]]), documentPath, packages).get(name) ?? []
  return [...new Set(matches.map(fact => fact.ownerId))].sort()
}

const genericFindings = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, changes: readonly Change[], texts: VerifiedDocuments) => {
  const oldFacts = referenceFacts(base)
  if (!oldFacts.length) return []
  const byId = new Map(oldFacts.map(fact => [fact.id, fact]))
  const newFacts = referenceFacts(head)
  const documents = new Map<string, ReturnType<typeof parseMarkdownDocument> | undefined>()
  const after = new Map(head.entities.map(entity => [entity.id, entity]))
  const before = new Map(base.entities.map(entity => [entity.id, entity]))
  const removed = new Set(changes.filter(change => change.op === 'removed' || change.op === 'renamed').map(change => change.before!.id))
  const findings = new Map<string, ReturnType<typeof DiagnosticSchema.parse>>()
  for (const relation of base.relations) {
    if (!DOCUMENT_RELATIONS.has(relation.kind) || relation.metadata?.confidence === 'fuzzy') continue
    const symbol = typeof relation.metadata?.symbol === 'string' ? relation.metadata.symbol : undefined
    const kind = symbol ? 'symbol' : relation.metadata?.factKind
    const name = symbol ?? relation.metadata?.factName
    if (typeof name !== 'string' || (kind !== 'package' && !SurfaceFactKindSchema.safeParse(kind).success)) continue
    const fact = byId.get(kind === 'package' ? relation.to : surfaceFactEntityId(kind as SurfaceFact['kind'], relation.to, name))
    const doc = after.get(relation.from)
    if (!fact || !doc?.path || doc.kind !== 'document') continue
    const candidates = fact.kind === 'config-key' ? configKeyOwnerCandidates(head, doc.path, fact.name, newFacts) : [...new Set(newFacts.filter(item => item.kind === fact.kind && item.name === fact.name).map(item => item.ownerId))].sort()
    const baseCandidates = new Set(fact.kind === 'config-key' ? configKeyOwnerCandidates(base, doc.path, fact.name, oldFacts) : oldFacts.filter(item => item.kind === fact.kind && item.name === fact.name).map(item => item.ownerId))
    const ambiguous = baseCandidates.size === 1 && candidates.length > 1
    if (!removed.has(fact.id) && !ambiguous) continue
    const text = texts.get(doc.id)
    if (!documents.has(doc.id)) documents.set(doc.id, text === undefined ? undefined : parseMarkdownDocument(doc.path, text))
    const parsed = documents.get(doc.id)
    const cli = fact.kind === 'cli-command' || fact.kind === 'cli-flag'
    const cliOwner = fact.kind === 'cli-command' ? fact.name : oldFacts.find(item => item.id === fact.ownerId)?.name
    const citations = cli ? parsed?.cliTokens.filter(token => token.kind === fact.kind && (!token.bin || token.bin === cliOwner?.split(' ')[0])) : parsed?.codeTokens
    const tokens = citations?.filter(token => token.value === fact.name) ?? []
    if (parsed && !tokens.length) continue
    const code = ambiguous ? 'AMBIGUOUS_REFERENCE' : 'BROKEN_REFERENCE'
    const status = ambiguous ? 'unresolved' : parsed && extractionComplete(base, head, fact.kind, fact.evidence) ? 'conflict' : 'stale-or-unverified'
    const evidence: Evidence[] = [
      ...relation.evidence.map(item => ({ ...item, context: 'Base citation' })),
      ...tokens.slice(0, 8).map(token => ({ source: 'documentation' as const, path: doc.path!, lineStart: token.line, lineEnd: token.line, contentHash: parsed!.contentHash, context: 'Head citation' })),
      ...fact.evidence.map(item => ({ ...item, context: 'Base target removed or no longer uniquely resolved' })),
      ...(after.get(fact.ownerId)?.evidence ?? []).map(item => ({ ...item, context: 'Head owner' })),
    ].slice(0, 64)
    // Preserve the symbol locator and target projection used by existing findings.
    const id = entityId('finding', sha256NormalizedV1({ code, document: doc.id, relationKind: relation.kind, target: relation.to,
      ...(symbol ? { symbol } : { factKind: fact.kind, factName: fact.name }),
      ...(ambiguous ? { candidateModuleIds: candidates } : { removedTargetId: fact.id }),
    }))
    findings.set(id, DiagnosticSchema.parse({ id, code, status, severity: 'warn', message: `${doc.path} cites ${fact.name}, which ${ambiguous ? 'is no longer uniquely resolved' : 'is recorded as removed in the snapshot delta'}.`, evidence, entityIds: [doc.id, before.get(fact.ownerId)!.id], relationIds: [relation.id] }))
  }
  return [...findings.values()]
}

const verifiedLocalDocuments = (head: DiscoverySnapshotV1, root: string): Map<string, string> => {
  const texts = new Map<string, string>()
  for (const doc of head.entities.filter(entity => entity.kind === 'document' && entity.path)) {
    try {
      const path = containedProjectPath(root, doc.path!)
      if (!path) continue
      const text = readBoundedText(path, { used: 0 }, { maxFileBytes: 1_000_000 })
      if (parseMarkdownDocument(doc.path!, text).contentHash === hashOf(doc)) texts.set(doc.id, text)
    } catch { /* Unavailable text cannot prove a current citation. */ }
  }
  return texts
}

/** Exact head reader; the synchronous public facade below remains available. */
export const diffSnapshotsWithRead = async (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, read: RepositoryReadV1, options: { signal?: AbortSignal; branch?: string; profile?: ExecutionProfile } = {}) => withExecutionProfile(options.profile, async () => {
  if (read.partition.revision !== head.sourceRevision) throw new Error('HEAD_PARTITION_MISMATCH')
  const partition = Object.freeze({ ...read.partition })
  const signal = options.signal ?? new AbortController().signal
  const texts = new Map<string, string>()
  for (const doc of head.entities.filter(entity => entity.kind === 'document' && entity.path)) {
    const meta = await read.stat({ partition, signal, path: doc.path! })
    if (meta.status !== 'ok' || meta.value.kind !== 'file' || meta.value.bytes > 1_000_000) continue
    const result = await read.read({ partition, signal, path: doc.path!, ...(meta.value.content ? { expected: meta.value.content } : {}) })
    if (result.status !== 'ok' || result.value.bytes.length > 1_000_000 || contentRef(result.value.bytes).hash !== result.value.content.hash) continue
    const text = Buffer.from(result.value.bytes).toString('utf8')
    if (parseMarkdownDocument(doc.path!, text).contentHash === hashOf(doc)) texts.set(doc.id, text)
  }
  return diffWithDocuments(base, head, options, texts)
})

export const diffSnapshots = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, options: DiffOptions = {}) =>
  diffWithDocuments(base, head, options, options.headRoot && referenceFacts(base).length ? verifiedLocalDocuments(head, options.headRoot) : new Map())

const diffWithDocuments = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, options: DiffOptions, texts: VerifiedDocuments) => {
  if (canonicalJsonV1(base.project) !== canonicalJsonV1(head.project)) throw new Error('Cannot diff different project identities; provide snapshots from the same repository.')
  const changes = snapshotChanges(base, head)
  const coverage: ChangeSetV1['coverage'] = [
    ...(packagesOf(head).length ? [{ analyzer: 'diff', scope: 'package-version-routing', status: 'not-analyzed' as const, reason: 'Package mappings do not establish version routing or release eligibility.' }] : []),
    ...base.coverage.map((entry) => ({ ...entry, scope: entityId('base', entry.scope) })),
    ...head.coverage.map((entry) => ({ ...entry, scope: entityId('head', entry.scope) })),
    ...['cli-command', 'cli-flag', 'config-key', 'signature', 'rename-detection', 'package-identity-and-version-routing'].flatMap((scope): ChangeSetV1['coverage'] => {
      if (scope === 'package-identity-and-version-routing' && packagesOf(head).length) return []
      const capability = FACT_CAPABILITIES[scope as SurfaceFact['kind']]
      const extraction = head.coverage.filter(entry => entry.scope === capability)
      if (extraction.length) {
        const incomplete = [...extraction, ...head.coverage.filter(entry => entry.scope === 'plugin' && extraction.some(other => other.analyzer === entry.analyzer))].find(entry => entry.status !== 'complete' && entry.status !== 'not-applicable')
        return incomplete ? [{ analyzer: 'diff', scope, status: 'partial', reason: incomplete.reason ?? 'Adapter extraction is incomplete.' }] : []
      }
      return [{ analyzer: 'diff', scope, status: 'not-analyzed', reason: 'No adapter extraction evidence is available.' }]
    }),
  ].filter((entry) => !(entry.analyzer === 'repository' && entry.scope.endsWith(':reused-entities'))).sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
  const analysisIdentity = (snapshot: DiscoverySnapshotV1) => ({ configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions })
  const changeSet = ChangeSetV1Schema.parse({ type: 'change-set', schemaVersion: 1, repository: base.project, analysis: { base: analysisIdentity(base), head: analysisIdentity(head) },
    ...(options.branch ? { branch: options.branch } : {}), baseRevision: base.sourceRevision, headRevision: head.sourceRevision,
    release: { state: 'unreleased' }, packages: packagesOf(head).map(({ id, purl, version }) => ({ id, purl, ...(version ? { version } : {}) })).sort((a,b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b))), changes, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-semantic-v1', coverage })
  changeSet.contentHash = changeSetContentHash(changeSet)
  const after = new Map(head.entities.map((entity) => [entity.id, entity]))
  const before = new Map(base.entities.map((entity) => [entity.id, entity]))
  const resolution = resolutionFor(base)
  const baseFacts = factsOf(base)
  const factIds = new Set(referenceFacts(base).map(fact => fact.id))
  const removals = new Map(changes.filter((change) => change.op === 'removed' && ['module', 'doc-path', 'symbol'].includes(change.kind)).map((change) => [change.before!.id, change]))
  const partial = head.coverage.some((entry) => entry.status === 'partial' && (entry.scope.startsWith('limits:') || entry.scope === 'static-imports-and-exports' || entry.scope === 'workspace-packages'))
  const citations = new Map<string, KnowledgeRelation[] | undefined>()
  const findings = new Map<string, ReturnType<typeof DiagnosticSchema.parse>>()
  for (const relation of [...base.relations].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!DOCUMENT_RELATIONS.has(relation.kind) || relation.metadata?.confidence === 'fuzzy') continue
    const doc = after.get(relation.from)
    const target = before.get(relation.to)
    if (!doc?.path || doc.kind !== 'document' || !target) continue
    const symbol = typeof relation.metadata?.symbol === 'string' ? relation.metadata.symbol : undefined
    const factKind = symbol ? 'symbol' : relation.metadata?.factKind
    const factName = symbol ?? relation.metadata?.factName
    if (typeof factName === 'string' && (factKind === 'package' ? factIds.has(relation.to) : SurfaceFactKindSchema.safeParse(factKind).success && factIds.has(surfaceFactEntityId(factKind as SurfaceFact['kind'], relation.to, factName)))) continue
    const removed = removals.get(symbol ? entityId('symbol', `${relation.to}:${symbol}`) : relation.to)
    const ambiguous = symbol && resolution.symbols.get(symbol)?.length === 1 && Array.isArray(doc.metadata?.ambiguousSymbolReferences)
      ? doc.metadata.ambiguousSymbolReferences.find((item) => item && typeof item === 'object' && item.symbol === symbol) : undefined
    if (!removed && !ambiguous) continue
    if (!citations.has(doc.id)) citations.set(doc.id, options.headRoot ? citationsInHead(doc, base, options.headRoot, resolution) : texts.has(doc.id) ? citationsFromText(doc, base, texts.get(doc.id)!, resolution) : undefined)
    const currentCitations = citations.get(doc.id)
    const citation = currentCitations?.find((item) => item.kind === relation.kind && item.to === relation.to && item.metadata?.symbol === symbol)
    if (removed && currentCitations && !citation) continue
    const code = ambiguous ? 'AMBIGUOUS_REFERENCE' : 'BROKEN_REFERENCE'
    const ownerFacts = baseFacts.filter(fact => fact.ownerId === relation.to)
    const ownerComplete = ownerFacts.every(fact => extractionComplete(base, head, fact.kind, fact.evidence))
    const status = ambiguous ? 'unresolved' : citation && !partial && ownerComplete ? 'conflict' : 'stale-or-unverified'
    const headEvidence: Evidence[] = citation?.evidence ?? (ambiguous && Array.isArray(ambiguous.lines) ? ambiguous.lines.filter((line: unknown): line is number => typeof line === 'number').slice(0, 8).map((line: number) => ({ source: 'documentation' as const, path: doc.path!, lineStart: line, lineEnd: line, contentHash: hashOf(doc) })) : [])
    const evidence = [...relation.evidence.map((item) => ({ ...item, context: 'Base citation' })), ...headEvidence.map((item) => ({ ...item, context: 'Head citation' })), ...(removed?.before?.evidence ?? target.evidence).map((item) => ({ ...item, context: 'Base target removed or no longer uniquely resolved' })), ...(after.get(target.id)?.evidence ?? []).map((item) => ({ ...item, context: 'Head owner' }))].slice(0, 64)
    const relevantIdentity = ambiguous
      ? { candidateModuleIds: Array.isArray(ambiguous.candidateModuleIds) ? [...new Set(ambiguous.candidateModuleIds.filter((id: unknown): id is string => typeof id === 'string'))].sort() : [] }
      : { removedTargetId: removed!.before!.id }
    const id = entityId('finding', sha256NormalizedV1({ code, document: doc.id, relationKind: relation.kind, target: relation.to, symbol, ...relevantIdentity }))
    findings.set(id, DiagnosticSchema.parse({ id, code, status, severity: 'warn', message: `${doc.path} cites ${symbol ?? target.path ?? target.name}, which ${ambiguous ? 'is no longer uniquely resolved' : 'is recorded as removed in the snapshot delta'}.`, evidence, entityIds: [doc.id, target.id], relationIds: [relation.id] }))
  }
  return { changeSet, impact: changeImpact(base, head, changes), findings: [...findings.values(), ...genericFindings(base, head, changes, texts)].sort((a, b) => a.id.localeCompare(b.id)) }
}
