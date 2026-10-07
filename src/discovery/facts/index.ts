import * as ts from 'typescript'
import { scriptKind } from '../inputs.js'
import type { ScanIO } from '../scan-io.js'
import type { ModuleInfo, PackageInfo } from '../plugins/js-ts.js'
import type { DiscoverySnapshotV1 } from '../../schemas/knowledge.js'
import type { SurfaceFact } from '../../storage/facts.js'

export type FactKind = SurfaceFact['kind']
export type FactExtractorInput = Readonly<{
  root: string
  io: ScanIO
  sourceFiles: ReadonlyMap<string, ts.SourceFile>
  modules: ReadonlyMap<string, ModuleInfo>
  packages: readonly PackageInfo[]
}>
export interface FactExtractor {
  readonly id: `js-ts:${string}`
  readonly version: string
  readonly kinds: readonly FactKind[]
  extract(input: FactExtractorInput): { facts: readonly SurfaceFact[]; coverage: DiscoverySnapshotV1['coverage'] }
}
export const FACT_EXTRACTORS: readonly FactExtractor[] = []

export const factAnalyzerVersions = (): Readonly<Record<string, string>> => Object.fromEntries(FACT_EXTRACTORS.map(extractor => [extractor.id, extractor.version]))

export const runFactExtractors = (input: Omit<FactExtractorInput, 'sourceFiles'>) => {
  const facts: SurfaceFact[] = []
  const coverage: DiscoverySnapshotV1['coverage'] = []
  if (FACT_EXTRACTORS.length) {
    const sourceFiles = new Map([...input.modules.values()].map(module => [module.path, ts.createSourceFile(module.path, input.io.readText(module.absPath), ts.ScriptTarget.Latest, true, scriptKind(module.path))]))
    for (const extractor of FACT_EXTRACTORS) {
      const output = extractor.extract({ ...input, sourceFiles })
      facts.push(...output.facts)
      coverage.push(...output.coverage.map(entry => ({ ...entry, analyzer: extractor.id, analyzerVersion: extractor.version })))
    }
  }
  return { facts, coverage }
}
