import { cliFactExtractor } from './cli.js'
import * as ts from 'typescript'
import { signatureExtractor } from './signatures.js'
import { relative, resolve } from 'node:path'
import { toPosix } from '../../lib/paths.js'
import { scriptKind } from '../inputs.js'
import type { ScanIO } from '../scan-io.js'
import type { ModuleInfo, PackageInfo } from '../plugins/js-ts.js'
import type { DiscoverySnapshotV1 } from '../../schemas/knowledge.js'
import { surfaceFactFromEntity, type SurfaceFact } from '../../storage/facts.js'
import { sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import type { PreviousSnapshot } from '../incremental.js'
import { configFactExtractor } from './config.js'
import type { SafeWalkOptions } from '../../safety/repository.js'

export type FactKind = SurfaceFact['kind']
export type FactExtractorInput = Readonly<{
  root: string
  io: ScanIO
  sourceFiles: ReadonlyMap<string, ts.SourceFile>
  modules: ReadonlyMap<string, ModuleInfo>
  packages: readonly PackageInfo[]
  walkOptions?: SafeWalkOptions
}>
export interface FactExtractor {
  readonly id: `js-ts:${string}`
  readonly version: string
  readonly kinds: readonly FactKind[]
  /** Global source/package inputs by default; changed input requires re-extraction. */
  readonly inputScope?: 'global'
  /** Additional scan-safe inputs whose additions, removals and content invalidate reuse. */
  readonly inputExtensions?: readonly string[]
  extract(input: FactExtractorInput): { facts: readonly SurfaceFact[]; coverage: DiscoverySnapshotV1['coverage'] }
}
export const FACT_EXTRACTORS: readonly FactExtractor[] = [cliFactExtractor, configFactExtractor, signatureExtractor]

export const factAnalyzerVersions = (): Readonly<Record<string, string>> => Object.fromEntries(FACT_EXTRACTORS.map(extractor => [extractor.id, extractor.version]))

type FactTrees = ReadonlyMap<string, ts.SourceFile>
const sourceTrees = new WeakMap<object, FactTrees>()

export const runFactExtractors = (input: Omit<FactExtractorInput, 'sourceFiles'> & { previous?: PreviousSnapshot }) => {
  const facts: SurfaceFact[] = []
  const coverage: DiscoverySnapshotV1['coverage'] = []
  const priorTrees = input.previous && sourceTrees.get(input.previous)
  let sourceFiles: FactTrees = priorTrees ?? new Map()
  if (FACT_EXTRACTORS.length) {
    const texts = new Map([...input.modules.values()].map(module => [module.path, input.io.readText(module.absPath)]))
    const priorModules = new Map(input.previous?.entities.filter(entity => entity.kind === 'module').map(entity => [entity.id, entity]) ?? [])
    const priorPackages = new Map(input.previous?.entities.filter(entity => entity.kind === 'package').map(entity => [entity.id, entity]) ?? [])
    const inputCoverage = FACT_EXTRACTORS.filter(extractor => extractor.inputExtensions?.length).map(extractor => {
      const walk = input.io.walk([...extractor.inputExtensions!], input.walkOptions ?? {})
      const hashes = walk.files.slice().sort().map(path => [toPosix(relative(input.root, path)), sha256NormalizedV1(input.io.readText(path))])
      return { analyzer: extractor.id, analyzerVersion: extractor.version, scope: `extractor-inputs:${sha256NormalizedV1(hashes)}`, status: walk.incomplete ? 'partial' as const : 'complete' as const, ...(walk.incomplete ? { reason: 'Additional extractor input walk is incomplete.' } : {}) }
    })
    const evidenceUnchanged = input.previous?.coverage.filter(entry => FACT_EXTRACTORS.some(extractor => extractor.id === entry.analyzer) && !entry.scope.startsWith('extractor-inputs:')).every(entry => (entry.evidence ?? []).every(evidence => {
      const path = resolve(input.root, evidence.path)
      return input.io.host.fileExists(path) && evidence.contentHash === sha256NormalizedV1(input.io.readText(path))
    }))
    const unchanged = evidenceUnchanged && inputCoverage.every(entry => entry.status === 'complete' && input.previous?.coverage.some(prior => prior.analyzer === entry.analyzer && prior.scope === entry.scope && prior.status === 'complete')) && input.previous && priorModules.size === input.modules.size && priorPackages.size === input.packages.length &&
      [...input.modules.values()].every(module => priorModules.get(module.entityId)?.evidence[0]?.contentHash === sha256NormalizedV1(texts.get(module.path)!)) &&
      input.packages.every(pkg => priorPackages.get(pkg.id)?.evidence[0]?.contentHash === sha256NormalizedV1(input.io.readText(pkg.manifestPath))) &&
      FACT_EXTRACTORS.every(extractor => input.previous?.analyzerVersions?.[extractor.id] === extractor.version && input.previous.coverage.some(entry => entry.analyzer === extractor.id))
    if (unchanged) {
      const kinds = new Set(FACT_EXTRACTORS.flatMap(extractor => extractor.kinds))
      facts.push(...input.previous!.entities.filter(entity => kinds.has(entity.kind as FactKind) && entity.metadata?.factCodecVersion === 1).map(surfaceFactFromEntity))
      coverage.push(...input.previous!.coverage.filter(entry => FACT_EXTRACTORS.some(extractor => extractor.id === entry.analyzer)))
    } else {
      sourceFiles = new Map([...input.modules.values()].map(module => {
        const text = texts.get(module.path)!
        const cached = priorTrees?.get(module.path)
        return [module.path, cached?.fileName === module.absPath && cached.getFullText() === text ? cached : ts.createSourceFile(module.absPath, text, ts.ScriptTarget.Latest, true, scriptKind(module.path))]
      }))
      coverage.push(...inputCoverage)
      for (const extractor of FACT_EXTRACTORS) {
        const output = extractor.extract({ ...input, sourceFiles })
        facts.push(...output.facts)
        coverage.push(...output.coverage.map(entry => ({ ...entry, analyzer: extractor.id, analyzerVersion: extractor.version })))
      }
    }
  }
  return { facts, coverage, remember(snapshot: object) { sourceTrees.set(snapshot, sourceFiles) } }
}
