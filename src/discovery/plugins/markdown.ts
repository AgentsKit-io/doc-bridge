import { resolveDocumentTargets, type TargetAdapter } from '../document-targets.js'
import { createJsTsPluginV2 } from './js-ts.js'
import { canonicalJsonV1 } from '../../index-builder/content-hash.js'
import { packageFactFromEntity, surfaceFactFromEntity } from '../../storage/facts.js'
import { builtInManifest, pluginScan, extractionGraph, extractionOutput, createReplayRelations } from './built-in.js'
import type { DiscoveryPluginV2 } from '../../plugins/contract.js'
import { DOCUMENT_EXTENSIONS, safeWalkOptions } from '../inputs.js'
import { emptyLedger, exportsOf, declaredExportsOf, moduleUniverseFingerprint } from '../incremental.js'
import { join, resolve } from 'node:path'
import { basename, relative } from 'node:path'
import type { DiscoveryOptions } from '../repository.js'
import type { ScanIO } from '../scan-io.js'
import type { SourceState, SourceContext, ExtractionGraph } from './js-ts.js'
import type { deriveAreas } from '../areas.js'
import { entityId } from '../identity.js'
import { toPosix } from '../../lib/paths.js'
import { resolutionFingerprint, type PriorFile } from '../incremental.js'
import { MARKDOWN_ANALYZER_VERSION, analyzeMarkdownDocument, markdownPathCandidateIndex, declaredAudience, markdownContentHash, parseMarkdownDocument, type MarkdownDocumentV1, type AmbiguousSymbolReference, type MarkdownFact, type AmbiguousFactReference } from '../markdown.js'
import { documentClassification } from '../inputs.js'
import type { DiscoverySnapshotV1, Evidence } from '../../schemas/knowledge.js'
const MAX_MARKDOWN_NOTES = 32
const relativePath = (root: string, path: string): string => toPosix(relative(root, path)) || '.'
const lineEvidence = (source: 'code' | 'configuration' | 'documentation', root: string, path: string, lineStart?: number, lineEnd?: number): Evidence => ({ source, path: relativePath(root, path), ...(lineStart !== undefined ? { lineStart } : {}), ...(lineEnd !== undefined ? { lineEnd } : {}) })
type DocumentContext = ExtractionGraph & Omit<SourceState, 'sourceFiles'> & {
  root: string; opts: DiscoveryOptions; documentPaths: readonly string[]
  packageResult: SourceContext['packageResult']
  coverage: DiscoverySnapshotV1['coverage']
  areas: ReturnType<typeof deriveAreas>
  facts?: ReadonlyMap<string, readonly MarkdownFact[]>
  areasByPath: Map<string, string>
}
export const createMarkdownExtraction = (io: ScanIO, adapters: readonly DiscoveryPluginV2[] = [createJsTsPluginV2()]) => ({
  manifest: markdownManifest, documentExtensions: DOCUMENT_EXTENSIONS,
  extract({ root, opts, documentPaths, packageResult, entities, relations, addEntity, addRelation, coverage, prior, modulesByPath, moduleUniverse, reuseModuleRelations, symbolModules, ledger, areas, areasByPath, facts }: DocumentContext) {
  /*
   * Documents are parsed first and added as entities after their relations are known, because
   * whether a document's references were truncated is part of what the entity has to say.
   */
  const markdownDocuments: MarkdownDocumentV1[] = []
  const documentsByPath = new Map<string, string>()
  const documentFiles = new Map<string, string>()
  const unreadableDocuments: string[] = []
  for (const absPath of documentPaths) {
    documentFiles.set(relativePath(root, absPath), absPath)
  }
  for (const path of documentFiles.keys()) documentsByPath.set(path, entityId('document', path))

  /*
   * Whether an id will be in this snapshot.
   *
   * A replayed relation is checked against what the scan is going to produce, not against what it
   * has produced so far: documents and modules get their entities late, and an edge to a file that
   * plainly exists must not be dropped for arriving early.
   */
  const plannedIds = new Set([...modulesByPath.values(), ...documentsByPath.values()])

  /**
   * Put a reused entity's edges back.
   *
   * An edge whose internal target is gone is dropped — the file it pointed at was renamed or
   * deleted, and a graph that keeps the edge is lying about the repository. An external or
   * unresolved endpoint is re-created instead, because such an entity is in the snapshot only
   * because something referenced it, and that something is exactly what was reused.
   */
  const replayRelations = createReplayRelations({ entities, relations, addEntity, addRelation }, plannedIds)

  /*
   * Whether a document's references can resolve differently than they did last time.
   *
   * A document resolves against more than a module does: it can name another document, an area,
   * a package or an exported symbol. So document reuse is refused unless all of that is identical
   * — a symbol that moved from one module to another changes where a mention points without
   * changing a single byte of the document that mentions it.
   */
  const resolution = resolutionFingerprint({
    moduleUniverse,
    documentPaths: [...documentFiles.keys()],
    areaPaths: areas.map((area) => area.path),
    symbols: symbolModules,
  })
  const packageUniverse = canonicalJsonV1([...entities.values()].filter(entity => entity.kind === 'package').sort((a,b) => a.id.localeCompare(b.id)).map(entity => entity.metadata))
  const oldPackageUniverse = canonicalJsonV1(opts.previous?.entities.filter(entity => entity.kind === 'package').sort((a,b) => a.id.localeCompare(b.id)).map(entity => entity.metadata) ?? [])
  const reuseDocumentRelations = Boolean(prior) && prior?.resolution === resolution && packageUniverse === oldPackageUniverse
  if (prior && reuseModuleRelations && !reuseDocumentRelations) {
    ledger.invalidated.push(prior?.resolution !== resolution ? 'the set of documents, areas or exported symbols changed' : 'package version facts changed')
  }

  const reusedDocuments = new Map<string, PriorFile>()
  for (const [path, absPath] of documentFiles) {
    let text: string
    try {
      text = io.readText(absPath)
    } catch {
      unreadableDocuments.push(path)
      ledger.parsedFiles.push(path)
      continue
    }
    const priorDocument = prior?.documents.get(path)
    if (reuseDocumentRelations && priorDocument && priorDocument.contentHash === markdownContentHash(text)) {
      /*
       * Byte-identical, resolving against an identical universe: last scan's answer is this
       * scan's answer, and the Markdown tree is never built.
       */
      reusedDocuments.set(path, priorDocument)
      ledger.reusedEntities += 1
      ledger.skippedFiles.push(path)
      continue
    }
    ledger.parsedFiles.push(path)
    try {
      markdownDocuments.push(parseMarkdownDocument(path, text))
    } catch {
      unreadableDocuments.push(path)
    }
  }

  const packageNames = new Map<string, string>()
  const shortNames = new Map<string, string[]>()
  for (const pkg of packageResult.packages) {
    if (pkg.name) packageNames.set(pkg.name, pkg.id)
    const short = pkg.name?.split('/').pop() ?? pkg.path.split('/').pop()
    if (short) {
      const owners = shortNames.get(short)
      if (owners) owners.push(pkg.id)
      else shortNames.set(short, [pkg.id])
    }
  }
  for (const [short, owners] of shortNames) {
    if (owners.length === 1 && owners[0] && !packageNames.has(short)) packageNames.set(short, owners[0])
  }

  const markdownResolution = {
    packagePaths: packageResult.packages.map(pkg => ({ id: pkg.id, path: pkg.path })),
    documents: documentsByPath,
    modules: modulesByPath,
    // Areas exist now, so a document naming a directory resolves to the unit, not to nothing.
    areas: areasByPath,
    packages: packageNames,
    symbols: symbolModules,
    ...(facts ? { facts } : {}),
    // One index for the whole run: the analyzer used to rebuild this per document.
    pathIndex: markdownPathCandidateIndex({ documents: documentsByPath, modules: modulesByPath, areas: areasByPath }),
  }
  type MarkdownNote = { readonly scope: string; readonly reason: string; readonly evidence: readonly Evidence[] }
  const notesByDocument = new Map<string, readonly MarkdownNote[]>()
  const truncatedDocuments = new Set<string>()
  const truncatedFactReferences = new Set<string>()
  const ambiguitiesByDocument = new Map<string, readonly AmbiguousSymbolReference[]>()
  const truncatedAmbiguities = new Set<string>()
  const factAmbiguities = new Map<string, readonly AmbiguousFactReference[]>()
  const truncatedFactAmbiguities = new Set<string>()
  for (const document of markdownDocuments) {
    const analysis = analyzeMarkdownDocument(document, entityId('document', document.path), markdownResolution)
    for (const relation of analysis.relations) addRelation(relation)
    notesByDocument.set(document.path, analysis.notes)
    ambiguitiesByDocument.set(document.path, analysis.ambiguousSymbolReferences)
    factAmbiguities.set(document.path, analysis.ambiguousFactReferences)
    if (analysis.ambiguousFactReferencesTruncated) truncatedFactAmbiguities.add(document.path)
    if (analysis.ambiguousSymbolReferencesTruncated) truncatedAmbiguities.add(document.path)
    if (analysis.truncated) truncatedDocuments.add(document.path)
    if (analysis.factReferencesTruncated) truncatedFactReferences.add(document.path)
  }

  for (const [path, priorDocument] of reusedDocuments) {
    // The resolution universe is identical, so every edge this document recorded still resolves the same way.
    replayRelations(priorDocument)
    notesByDocument.set(
      path,
      priorDocument.coverage.map((entry) => ({ scope: entry.scope, reason: entry.reason ?? '', evidence: entry.evidence ?? [] })),
    )
  }

  // Notes follow the walk, not the order documents happened to be parsed in, so reuse cannot move them.
  const markdownNotes: readonly MarkdownNote[] = [...documentFiles.keys()].flatMap((path) => [...(notesByDocument.get(path) ?? [])])

  const owners = [...entities.values()].filter(entity => entity.kind === 'package' && entity.metadata?.factCodecVersion === 1 && entity.path).sort((a,b) => b.path!.length - a.path!.length)
  const parsedDocuments = new Map(markdownDocuments.map((document) => [document.path, document]))
  for (const [path, absPath] of documentFiles) {
    const reused = reusedDocuments.get(path)
    if (reused) {
      addEntity(reused.entity)
      continue
    }
    const parsed = parsedDocuments.get(path)
    const owner = owners.find(entity => entity.path === '.' || path.startsWith(`${entity.path}/`))
    const targetAdapter: TargetAdapter = { normalizeRange(purl, range) {
      const results = adapters.flatMap(adapter => adapter.normalizeRange ? [adapter.normalizeRange(purl, range)] : [])
      const matches = results.filter(result => result.status === 'resolved')
      return matches.length === 1 ? matches[0]! : { status: matches.length ? 'ambiguous' : 'unresolved', reason: matches.length ? 'AMBIGUOUS_TARGET_ADAPTER' : 'UNRESOLVABLE_TARGET_RANGE', evidence: [] }
    } }
    const targets = parsed ? resolveDocumentTargets(parsed.frontmatterBlock?.value, { source: 'documentation', path, contentHash: parsed.contentHash, ...(parsed.frontmatterBlock ? { lineStart: parsed.frontmatterBlock.line } : {}) }, owner ? packageFactFromEntity(owner) : undefined, targetAdapter) : [{ state: 'unresolved', source: 'frontmatter', reason: 'UNREADABLE_DOCUMENT', evidence: [] }]
    addEntity({
      id: entityId('document', path),
      kind: 'document',
      name: basename(absPath),
      path,
      provenance: 'observed',
      evidence: [
        {
          ...lineEvidence('documentation', root, absPath, 1),
          ...(parsed ? { contentHash: parsed.contentHash } : {}),
        },
      ],
      metadata: {
        targets,
        classification: (parsed && declaredAudience(parsed.frontmatter)) ?? documentClassification(path),
        ...(parsed?.title ? { title: parsed.title } : {}),
        ...(parsed?.headings.length ? { headings: parsed.headings } : {}),
        ...(parsed?.summary ? { summary: parsed.summary } : {}),
        ...(parsed ? { wordCount: parsed.wordCount } : {}),
        ...(parsed && Object.keys(parsed.frontmatter).length ? { frontmatter: parsed.frontmatter } : {}),
        ...(parsed?.generatedRegions.length ? { generatedRegions: parsed.generatedRegions } : {}),
        ...(truncatedDocuments.has(path) ? { evidenceTruncated: true } : {}),
        ...(truncatedFactReferences.has(path) ? { factReferencesTruncated: true } : {}),
        ...(ambiguitiesByDocument.get(path)?.length ? { ambiguousSymbolReferences: ambiguitiesByDocument.get(path) } : {}),
        ...(factAmbiguities.get(path)?.length ? { ambiguousFactReferences: factAmbiguities.get(path) } : {}),
        ...(truncatedFactAmbiguities.has(path) ? { ambiguousFactReferencesTruncated: true } : {}),
        ...(truncatedAmbiguities.has(path) ? { ambiguousSymbolReferencesTruncated: true } : {}),
      },
    })
  }

  coverage.push({
    analyzer: 'markdown',
    scope: 'documentation-relations',
    status: unreadableDocuments.length ? 'partial' : 'complete',
    reason: unreadableDocuments.length
      ? `${unreadableDocuments.length} document(s) could not be read: ${unreadableDocuments.slice(0, 4).join(', ')}.`
      : `Analyzed ${markdownDocuments.length + reusedDocuments.size} document(s) for links, mentions and exported-symbol references.`,
  })
  for (const note of markdownNotes.slice(0, MAX_MARKDOWN_NOTES)) {
    coverage.push({ analyzer: 'markdown', scope: note.scope, status: 'partial', reason: note.reason, evidence: [...note.evidence.slice(0, 32)] })
  }
  if (markdownNotes.length > MAX_MARKDOWN_NOTES) {
    coverage.push({
      analyzer: 'markdown',
      scope: 'documentation-relations:notes',
      status: 'partial',
      reason: `${markdownNotes.length - MAX_MARKDOWN_NOTES} further ambiguous or truncated reference(s) were not listed.`,
    })
  }

    return { replayRelations }
  },
})

export const markdownManifest = builtInManifest('markdown', MARKDOWN_ANALYZER_VERSION, DOCUMENT_EXTENSIONS.map(extension => `**/*${extension}`))
export const createMarkdownPluginV2 = (adapters: readonly DiscoveryPluginV2[] = [createJsTsPluginV2()]): DiscoveryPluginV2 => ({
  manifest: markdownManifest,
  async discover(input) {
    const { root, opts, io } = await pluginScan(input)
    const graph = extractionGraph(input.resolution.entities, input.resolution.relations)
    const modulesByPath = new Map(input.resolution.entities.filter(entity => entity.kind === 'module' && entity.path).map(entity => [entity.path!, entity.id]))
    const packages = input.resolution.entities.filter(entity => entity.kind === 'package' && entity.path).map(entity => ({ id: entity.id, name: entity.name, path: entity.path!, absPath: resolve(root, entity.path!), manifestPath: join(root, entity.path!, 'package.json'), manifest: {} }))
    const facts = new Map<string, MarkdownFact[]>()
    for (const entity of input.resolution.entities) {
      if (entity.metadata?.factCodecVersion !== 1) continue
      const fact = entity.kind === 'package'
        ? { kind: 'package', name: packageFactFromEntity(entity).purl, ownerId: entity.id }
        : surfaceFactFromEntity(entity)
      facts.set(fact.name, [...(facts.get(fact.name) ?? []), fact])
    }
    const symbolModules = new Map<string, readonly string[]>()
    const forwarded = new Map<string, string[]>()
    for (const entity of input.resolution.entities) {
      if (entity.kind === 'symbol' && entity.name) {
        const fact = surfaceFactFromEntity(entity)
        symbolModules.set(fact.name, [...(symbolModules.get(fact.name) ?? []), fact.ownerId])
        continue
      }
      const declared = new Set(declaredExportsOf(entity))
      for (const name of exportsOf(entity)) {
        if (name === '*' || name === 'default') continue
        const owners = declared.has(name) ? symbolModules : forwarded
        owners.set(name, [...(owners.get(name) ?? []), entity.id])
      }
    }
    for (const [name, owners] of forwarded) if (!symbolModules.has(name)) symbolModules.set(name, owners)
    for (const [name, owners] of symbolModules) symbolModules.set(name, [...new Set(owners)])
    const areasByPath = new Map(input.resolution.entities.filter(entity => entity.kind === 'area' && entity.path).map(entity => [entity.path!, entity.id]))
    const coverage: DiscoverySnapshotV1['coverage'] = []
    createMarkdownExtraction(io, adapters).extract({ root, opts, ...graph, documentPaths: io.walk(DOCUMENT_EXTENSIONS, safeWalkOptions(opts.config)).files,
      packageResult: { packages, coverage: [] }, coverage,
      compiler: { options: {} }, ledger: emptyLedger(), prior: undefined,
      moduleUniverse: moduleUniverseFingerprint({ modulePaths: [...modulesByPath.keys()], packages, compilerOptions: {} }),
      reuseModuleRelations: false, modules: new Map(), modulesByPath, reusedModules: new Set(), areaModules: [], symbolModules,
      areas: [], areasByPath, facts,
    })
    return extractionOutput(graph, coverage, input)
  },
})
