import { readFileSync, statSync } from 'node:fs'
import { parseDocumentationDeclarations } from '../discovery/documentation.js'
import { entityId } from '../discovery/identity.js'
import { exportsOf, FILE_BACKED_KINDS } from '../discovery/incremental.js'
import { analyzeMarkdownDocument, markdownPathCandidateIndex, parseMarkdownDocument, type MarkdownResolution } from '../discovery/markdown.js'
import { canonicalJsonV1, contentHashForVersionedArtifact, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { containedProjectPath } from '../lib/paths.js'
import { ChangeSetV1Schema, type Change, type ChangeSetV1 } from '../schemas/change-set.js'
import { DiagnosticSchema, type DiscoverySnapshotV1, type Evidence, type KnowledgeEntity, type KnowledgeRelation } from '../schemas/knowledge.js'

export type SnapshotForChanges = Pick<DiscoverySnapshotV1, 'entities' | 'relations' | 'sourceRevision'>
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
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id)
    const next = after.get(id)
    const entity = next ?? old!
    if (!old || !next || hashOf(old) !== hashOf(next)) changes.push({
      kind: entity.kind === 'document' ? 'doc-path' : entity.kind as 'module' | 'package',
      op: !old ? 'added' : !next ? 'removed' : 'changed',
      ...(old ? { before: identity(old) } : {}), ...(next ? { after: identity(next) } : {}),
    })
    if (entity.kind !== 'module') continue
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
    if (!path || statSync(path).size > 1_000_000) return undefined
    const content = readFileSync(path, 'utf8')
    const parsed = parseMarkdownDocument(document.path!, content)
    if (parsed.contentHash !== hashOf(document)) return undefined
    const observed = analyzeMarkdownDocument(parsed, document.id, resolution)
    if (observed.truncated) return undefined
    const declared = parseDocumentationDeclarations({ path: document.path!, content }, { snapshot: base, documentId: document.id })
    return [...observed.relations, ...declared.relations].filter((relation) => relation.metadata?.confidence !== 'fuzzy')
      .map((relation) => ({ ...relation, evidence: relation.evidence.map((item) => ({ ...item, contentHash: parsed.contentHash })) }))
  } catch { return undefined }
}

export const diffSnapshots = (base: DiscoverySnapshotV1, head: DiscoverySnapshotV1, options: { headRoot?: string; branch?: string } = {}) => {
  if (canonicalJsonV1(base.project) !== canonicalJsonV1(head.project)) throw new Error('Cannot diff different project identities; provide snapshots from the same repository.')
  const changes = snapshotChanges(base, head)
  const coverage: ChangeSetV1['coverage'] = [
    ...base.coverage.map((entry) => ({ ...entry, scope: entityId('base', entry.scope) })),
    ...head.coverage.map((entry) => ({ ...entry, scope: entityId('head', entry.scope) })),
    ...['cli-command', 'cli-flag', 'config-key', 'signature', 'rename-detection', 'package-identity-and-version-routing'].map((scope) => ({ analyzer: 'diff', scope, status: 'not-analyzed' as const, reason: 'No adapter extraction evidence is available.' })),
  ].filter((entry) => !(entry.analyzer === 'repository' && entry.scope.endsWith(':reused-entities'))).sort((a, b) => canonicalJsonV1(a).localeCompare(canonicalJsonV1(b)))
  const analysisIdentity = (snapshot: DiscoverySnapshotV1) => ({ configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions })
  const changeSet = ChangeSetV1Schema.parse({ type: 'change-set', schemaVersion: 1, repository: base.project, analysis: { base: analysisIdentity(base), head: analysisIdentity(head) },
    ...(options.branch ? { branch: options.branch } : {}), baseRevision: base.sourceRevision, headRevision: head.sourceRevision,
    release: { state: 'unreleased' }, packages: [], changes, contentHash: '0'.repeat(64), contentHashAlgo: 'sha256-semantic-v1', coverage })
  changeSet.contentHash = changeSetContentHash(changeSet)
  const after = new Map(head.entities.map((entity) => [entity.id, entity]))
  const before = new Map(base.entities.map((entity) => [entity.id, entity]))
  const resolution = resolutionFor(base)
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
    const removed = removals.get(symbol ? entityId('symbol', `${relation.to}:${symbol}`) : relation.to)
    const ambiguous = symbol && resolution.symbols.get(symbol)?.length === 1 && Array.isArray(doc.metadata?.ambiguousSymbolReferences)
      ? doc.metadata.ambiguousSymbolReferences.find((item) => item && typeof item === 'object' && item.symbol === symbol) : undefined
    if (!removed && !ambiguous) continue
    if (!citations.has(doc.id)) citations.set(doc.id, options.headRoot ? citationsInHead(doc, base, options.headRoot, resolution) : undefined)
    const currentCitations = citations.get(doc.id)
    const citation = currentCitations?.find((item) => item.kind === relation.kind && item.to === relation.to && item.metadata?.symbol === symbol)
    if (removed && currentCitations && !citation) continue
    const code = ambiguous ? 'AMBIGUOUS_REFERENCE' : 'BROKEN_REFERENCE'
    const status = ambiguous ? 'unresolved' : citation && !partial ? 'conflict' : 'stale-or-unverified'
    const headEvidence: Evidence[] = citation?.evidence ?? (ambiguous && Array.isArray(ambiguous.lines) ? ambiguous.lines.filter((line: unknown): line is number => typeof line === 'number').slice(0, 8).map((line: number) => ({ source: 'documentation' as const, path: doc.path!, lineStart: line, lineEnd: line, contentHash: hashOf(doc) })) : [])
    const evidence = [...relation.evidence.map((item) => ({ ...item, context: 'Base citation' })), ...headEvidence.map((item) => ({ ...item, context: 'Head citation' })), ...(removed?.before?.evidence ?? target.evidence).map((item) => ({ ...item, context: 'Base target removed or no longer uniquely resolved' })), ...(after.get(target.id)?.evidence ?? []).map((item) => ({ ...item, context: 'Head owner' }))].slice(0, 64)
    const id = entityId('finding', sha256NormalizedV1({ code, document: doc.id, target: relation.to, symbol, evidence }))
    findings.set(id, DiagnosticSchema.parse({ id, code, status, severity: 'warn', message: `${doc.path} cites ${symbol ?? target.path ?? target.name}, which ${ambiguous ? 'is no longer uniquely resolved' : 'is recorded as removed in the snapshot delta'}.`, evidence, entityIds: [doc.id, target.id], relationIds: [relation.id] }))
  }
  return { changeSet, impact: changeImpact(base, head, changes), findings: [...findings.values()].sort((a, b) => a.id.localeCompare(b.id)) }
}
