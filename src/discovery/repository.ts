import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import * as ts from 'typescript'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { expandWorkspaceGlobs } from '../lib/glob-expand.js'
import { detectPackageManager } from '../lib/package-manager.js'
import { toPosix } from '../lib/paths.js'
import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { safeWalkFiles } from '../safety/repository.js'
import { GRAPH_ANALYZER_VERSION, areaSuggestionCoverage } from '../graph/build.js'
import { deriveAreas, type AreaModule } from './areas.js'
import { entityId } from './identity.js'
import {
  emptyLedger,
  exportsOf,
  declaredExportsOf,
  fileContentHash,
  indexPriorSnapshot,
  moduleUniverseFingerprint,
  replayableRelations,
  resolutionFingerprint,
  reuseCoverage,
  reuseRefusal,
  type PreviousSnapshot,
  type PriorFile,
} from './incremental.js'
import {
  MARKDOWN_ANALYZER_VERSION,
  analyzeMarkdownDocument,
  markdownPathCandidateIndex,
  declaredAudience,
  markdownContentHash,
  parseMarkdownDocument,
  type MarkdownDocumentV1,
} from './markdown.js'
import {
  CONFIG_EXTENSIONS,
  DEFAULT_MAX_FILES,
  DOCUMENT_EXTENSIONS,
  SOURCE_EXTENSIONS,
  documentClassification,
  exportedNames,
  safeWalkOptions,
  scriptKind,
} from './inputs.js'
import {
  DiscoverySnapshotV1Schema,
  type DiscoverySnapshotV1,
  type Evidence,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from '../schemas/knowledge.js'

const EMPTY_HASH = '0'.repeat(64)
const DEFAULT_RUNTIME_WIRING_METHODS = ['register', 'use', 'mount', 'attach'] as const
const TEST_MODULE_PATTERN = /(?:\.test|\.spec|__tests__)/
/** Coverage is evidence, not a log: past this many notes the list stops informing anyone. */
const MAX_MARKDOWN_NOTES = 32

type JsonRecord = Record<string, unknown>

type PackageInfo = {
  readonly id: string
  readonly name?: string
  readonly path: string
  readonly absPath: string
  readonly manifestPath: string
  readonly manifest: JsonRecord
}

type ModuleInfo = {
  readonly absPath: string
  readonly path: string
  readonly entityId: string
  readonly packageId?: string
}

type ImportReference = {
  readonly specifier: string
  readonly kind: 'imports' | 're-exports' | 'runtime-wiring'
  readonly evidence: Evidence
  readonly detection?: 'dynamic-literal' | 'runtime-wiring-static'
}

type DiscoveryOptions = {
  readonly root?: string
  readonly config?: DocBridgeConfigV1
  readonly maxFiles?: number
  readonly maxBytes?: number
  /**
   * A snapshot from a previous scan.
   *
   * Entities whose file hash is unchanged are taken from it instead of parsed again. Supplying one
   * cannot change the result: a reused run either produces the same snapshot a cold run would, or
   * the reuse is refused. Omit it to scan from scratch.
   */
  readonly previous?: PreviousSnapshot
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readJson = (path: string): { readonly value?: JsonRecord; readonly error?: string } => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isRecord(value) ? { value } : { error: 'JSON root is not an object' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const relativePath = (root: string, path: string): string =>
  toPosix(relative(root, path)) || '.'

const lineEvidence = (
  source: 'code' | 'configuration' | 'documentation',
  root: string,
  path: string,
  lineStart?: number,
  lineEnd?: number,
): Evidence => ({
  source,
  path: relativePath(root, path),
  ...(lineStart !== undefined ? { lineStart } : {}),
  ...(lineEnd !== undefined ? { lineEnd } : {}),
})

const firstLineContaining = (text: string, pattern: string): number | undefined => {
  const line = text.split(/\r?\n/).findIndex((value) => value.includes(pattern))
  return line >= 0 ? line + 1 : undefined
}

const packageName = (manifest: JsonRecord, fallback: string): string | undefined =>
  typeof manifest.name === 'string' && manifest.name.length > 0 ? manifest.name : fallback || undefined

const workspacePatterns = (root: string, rootManifest: JsonRecord | undefined): string[] => {
  const fromPackageJson = rootManifest?.workspaces
  if (Array.isArray(fromPackageJson)) return fromPackageJson.filter((value): value is string => typeof value === 'string')
  if (isRecord(fromPackageJson) && Array.isArray(fromPackageJson.packages)) {
    return fromPackageJson.packages.filter((value): value is string => typeof value === 'string')
  }

  const workspacePath = join(root, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) return []
  const patterns: string[] = []
  let inPackages = false
  for (const line of readFileSync(workspacePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === 'packages:') {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    if (trimmed.startsWith('- ')) {
      patterns.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''))
      continue
    }
    if (trimmed && !trimmed.startsWith('#')) inPackages = false
  }
  return patterns
}

const discoverPackages = (
  root: string,
  rootManifest: JsonRecord | undefined,
  config: DocBridgeConfigV1 | undefined,
): { readonly packages: readonly PackageInfo[]; readonly coverage: readonly { status: 'complete' | 'partial'; reason?: string }[] } => {
  const packages: PackageInfo[] = []
  const coverage: { status: 'complete' | 'partial'; reason?: string }[] = []
  const rootManifestPath = join(root, 'package.json')

  if (rootManifest) {
    const name = packageName(rootManifest, '')
    packages.push({
      id: entityId('package', packageName(rootManifest, 'root') ?? 'root'),
      ...(name ? { name } : {}),
      path: '.',
      absPath: root,
      manifestPath: rootManifestPath,
      manifest: rootManifest,
    })
  }

  const configuredPatterns = config?.routing?.options?.packages
  const patterns = configuredPatterns?.length ? [...configuredPatterns] : workspacePatterns(root, rootManifest)
  if (!patterns.length) {
    coverage.push({ status: 'complete' })
    return { packages, coverage }
  }

  const dirs = expandWorkspaceGlobs(root, patterns)
  for (const absPath of dirs) {
    const manifestPath = join(absPath, 'package.json')
    if (!existsSync(manifestPath)) continue
    const parsed = readJson(manifestPath)
    if (!parsed.value) {
      coverage.push({ status: 'partial', reason: `${relativePath(root, manifestPath)}: ${parsed.error ?? 'invalid package.json'}` })
      continue
    }
    const path = relativePath(root, absPath)
    const name = packageName(parsed.value, path)
    const id = entityId('package', name ?? path)
    const duplicate = packages.find((pkg) => pkg.id === id)
    // Compare toPosix'd, not raw: the root package above is always registered with its raw, native-separator
    // `absPath` (other code depends on that — e.g. `packageForModule`'s `startsWith` matching against
    // `safeWalkFiles`' own native-style paths), while `expandWorkspaceGlobs` always returns toPosix'd absPaths.
    // On Windows those are two different strings for the exact same directory whenever a workspace list
    // includes "." explicitly (root resolves to itself both ways) — a false-positive collision on every such
    // Windows checkout otherwise (reproduced live: harness's own `packages: [., apps/*]`).
    if (duplicate && toPosix(duplicate.absPath) !== toPosix(absPath)) {
      throw new Error(`Package identity collision for "${id}": "${duplicate.path}" and "${path}".`)
    }
    if (!duplicate) packages.push({ id, ...(name ? { name } : {}), path, absPath, manifestPath, manifest: parsed.value })
  }
  coverage.push({ status: 'complete' })
  return { packages: packages.sort((a, b) => a.id.localeCompare(b.id)), coverage }
}

const packageForModule = (packages: readonly PackageInfo[], absPath: string): PackageInfo | undefined =>
  [...packages]
    .filter((pkg) => absPath === pkg.absPath || absPath.startsWith(`${pkg.absPath}${sep}`))
    .sort((a, b) => b.absPath.length - a.absPath.length)[0]

const readCompilerOptions = (root: string): { readonly options: ts.CompilerOptions; readonly error?: string } => {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) return { options: {} }
  const parsed = ts.readConfigFile(configPath, ts.sys.readFile)
  if (parsed.error) return { options: {}, error: ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n') }
  const config = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(configPath))
  if (config.errors.length) {
    return {
      options: config.options,
      error: ts.flattenDiagnosticMessageText(config.errors[0]?.messageText ?? 'Invalid tsconfig', '\n'),
    }
  }
  return { options: config.options }
}

const nodeEvidence = (root: string, path: string, sourceFile: ts.SourceFile, node: ts.Node): Evidence => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
  return lineEvidence('code', root, path, start, end)
}

const moduleReferences = (
  root: string,
  path: string,
  sourceFile: ts.SourceFile,
  runtimeWiringMethods: ReadonlySet<string>,
): { readonly references: readonly ImportReference[]; readonly exports: readonly string[]; readonly dynamicEvidence: readonly Evidence[]; readonly hasDynamic: boolean; readonly hasLiteralDynamic: boolean; readonly hasRuntimeWiring: boolean; readonly hasUnresolvedRuntimeWiring: boolean } => {
  const references: ImportReference[] = []
  const dynamicEvidence: Evidence[] = []
  let hasDynamic = false
  let hasLiteralDynamic = false
  let hasRuntimeWiring = false
  let hasUnresolvedRuntimeWiring = false
  const importedBindings = new Map<string, string>()
  const staticStringBindings = new Map<string, string | undefined>()
  const localBindings = new Set<string>()
  const resolveStaticString = (expression: ts.Expression): string | undefined => {
    if (ts.isStringLiteralLike(expression)) return expression.text
    if (ts.isIdentifier(expression)) return staticStringBindings.get(expression.text)
    if (ts.isParenthesizedExpression(expression)) return resolveStaticString(expression.expression)
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveStaticString(expression.left)
      const right = resolveStaticString(expression.right)
      return left !== undefined && right !== undefined ? left + right : undefined
    }
    return undefined
  }
  const collectStaticStringBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
      const value = resolveStaticString(node.initializer)
      const previous = staticStringBindings.get(node.name.text)
      staticStringBindings.set(node.name.text, !staticStringBindings.has(node.name.text) || previous === value ? value : undefined)
    }
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name)
    ) localBindings.add(node.name.text)
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) &&
      node.name
    ) localBindings.add(node.name.text)
    ts.forEachChild(node, collectStaticStringBindings)
  }
  collectStaticStringBindings(sourceFile)
  const addImportedBindingReference = (expression: ts.Expression, node: ts.Node): boolean => {
    if (ts.isIdentifier(expression)) {
      const specifier = importedBindings.get(expression.text)
      if (specifier) {
        addReference({ text: specifier } as ts.StringLiteralLike, 'runtime-wiring', node, 'runtime-wiring-static')
        return true
      }
      return false
    }
    if (ts.isPropertyAccessExpression(expression)) return addImportedBindingReference(expression.expression, node)
    if (ts.isCallExpression(expression)) return addImportedBindingReference(expression.expression, node)
    return false
  }
  const isKnownLocal = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return localBindings.has(expression.text) || importedBindings.has(expression.text)
    if (expression.kind === ts.SyntaxKind.ThisKeyword) return true
    if (ts.isPropertyAccessExpression(expression)) return isKnownLocal(expression.expression)
    if (ts.isCallExpression(expression)) return isKnownLocal(expression.expression)
    return ts.isStringLiteralLike(expression)
  }
  const addReference = (specifier: ts.StringLiteralLike, kind: ImportReference['kind'], node: ts.Node, detection?: ImportReference['detection']): void => {
    references.push({ specifier: specifier.text, kind, evidence: nodeEvidence(root, path, sourceFile, node), ...(detection ? { detection } : {}) })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier, 'imports', node)
      const clause = node.importClause
      if (clause?.name) importedBindings.set(clause.name.text, node.moduleSpecifier.text)
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) importedBindings.set(clause.namedBindings.name.text, node.moduleSpecifier.text)
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) importedBindings.set((element.name ?? element.propertyName)?.text ?? '', node.moduleSpecifier.text)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier, 're-exports', node)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      addReference(node.moduleReference.expression, 'imports', node)
      importedBindings.set(node.name.text, node.moduleReference.expression.text)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0] ? resolveStaticString(node.arguments[0]) : undefined
        if (specifier !== undefined) {
          hasLiteralDynamic = true
          dynamicEvidence.push(nodeEvidence(root, path, sourceFile, node))
          addReference({ text: specifier } as ts.StringLiteralLike, 'imports', node, 'dynamic-literal')
        } else {
          hasDynamic = true
          dynamicEvidence.push(nodeEvidence(root, path, sourceFile, node))
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const argument = node.arguments[0]
        const specifier = argument ? resolveStaticString(argument) : undefined
        if (specifier !== undefined) {
          /*
           * A literal `require` is a dynamic load that resolved, so it counts as one.
           *
           * The evidence was always recorded here and the flag was not, which left the aggregate
           * entry sampling a file that had no per-file entry of its own — and made the aggregate
           * unreproducible from the per-file facts, which is exactly what a reused scan replays.
           */
          hasLiteralDynamic = true
          dynamicEvidence.push(nodeEvidence(root, path, sourceFile, node))
          addReference({ text: specifier } as ts.StringLiteralLike, 'imports', node)
        } else {
          hasDynamic = true
          dynamicEvidence.push(nodeEvidence(root, path, sourceFile, node))
        }
      } else if (ts.isPropertyAccessExpression(node.expression) && runtimeWiringMethods.has(node.expression.name.text)) {
        hasRuntimeWiring = true
        let hasUnresolvedTarget = false
        for (const argument of node.arguments) {
          if (ts.isStringLiteralLike(argument)) continue
          if (addImportedBindingReference(argument, node)) continue
          if (!isKnownLocal(argument)) hasUnresolvedTarget = true
        }
        const receiver = node.expression.expression
        if (hasUnresolvedTarget && !isKnownLocal(receiver)) hasUnresolvedRuntimeWiring = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return {
    references,
    exports: exportedNames(sourceFile),
    dynamicEvidence,
    hasDynamic,
    hasLiteralDynamic,
    hasRuntimeWiring,
    hasUnresolvedRuntimeWiring,
  }
}

const resolveRelativeModule = (specifier: string, containingFile: string, modulePaths: ReadonlyMap<string, ModuleInfo>): ModuleInfo | undefined => {
  const base = resolve(dirname(containingFile), specifier)
  const extension = extname(base)
  const extensionlessBase = extension ? base.slice(0, -extension.length) : base
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
    ...SOURCE_EXTENSIONS.map((extension) => `${extensionlessBase}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(extensionlessBase, `index${extension}`)),
  ]
  return candidates.map((candidate) => modulePaths.get(resolve(candidate))).find(Boolean)
}

const resolveReference = (
  reference: ImportReference,
  containingFile: string,
  modules: ReadonlyMap<string, ModuleInfo>,
  packages: readonly PackageInfo[],
  compilerOptions: ts.CompilerOptions,
): { readonly targetId: string; readonly targetEvidence?: Evidence } | undefined => {
  if (reference.specifier.startsWith('.') || reference.specifier.startsWith('/')) {
    const relativeTarget = resolveRelativeModule(reference.specifier, containingFile, modules)
    return relativeTarget ? { targetId: relativeTarget.entityId } : undefined
  }

  const packageTarget = [...packages]
    .filter((pkg) => pkg.name && (reference.specifier === pkg.name || reference.specifier.startsWith(`${pkg.name}/`)))
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))[0]
  if (packageTarget) return { targetId: packageTarget.id }

  const resolved = ts.resolveModuleName(reference.specifier, containingFile, compilerOptions, ts.sys).resolvedModule?.resolvedFileName
  const resolvedTarget = resolved ? modules.get(resolve(resolved)) : undefined
  if (resolvedTarget) return { targetId: resolvedTarget.entityId }

  return { targetId: entityId('external', reference.specifier) }
}

const dependencyEntries = (manifest: JsonRecord): readonly { readonly name: string; readonly type: string }[] => {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  return sections.flatMap((type) => {
    const value = manifest[type]
    if (!isRecord(value)) return []
    return Object.keys(value).sort().map((name) => ({ name, type }))
  })
}

const sourceRevision = (root: string, files: readonly string[]): { readonly value: string; readonly kind: 'git' | 'content' } => {
  const contentRevision = (): { readonly value: string; readonly kind: 'content' } => ({
    value: sha256NormalizedV1(
      files.map((path) => ({
        path: relativePath(root, path),
        contentHash: sha256NormalizedV1(readFileSync(path, 'utf8')),
      })),
    ),
    kind: 'content',
  })

  try {
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (status) return contentRevision()
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (value) return { value, kind: 'git' }
  } catch {
    // Not a Git checkout.
  }
  return contentRevision()
}

const hasPackageManagerMetadata = (root: string, rootManifest: JsonRecord | undefined): boolean =>
  Boolean(
    rootManifest?.packageManager ||
      existsSync(join(root, 'pnpm-lock.yaml')) ||
      existsSync(join(root, 'pnpm-workspace.yaml')) ||
      existsSync(join(root, 'yarn.lock')) ||
      existsSync(join(root, 'bun.lock')) ||
      existsSync(join(root, 'bun.lockb')) ||
      existsSync(join(root, 'package-lock.json')),
  )

const PIPELINE_VERSION = '1.5.0'
const ANALYZER_VERSIONS: Readonly<Record<string, string>> = { repository: '1.3.0', 'js-ts': '1.3.5', markdown: MARKDOWN_ANALYZER_VERSION, graph: GRAPH_ANALYZER_VERSION }
const configurationHashOf = (config: DocBridgeConfigV1 | undefined): string => sha256NormalizedV1(config ?? {})

const artifact = (root: string, config: DocBridgeConfigV1 | undefined, files: readonly string[], entities: readonly KnowledgeEntity[], relations: readonly KnowledgeRelation[], coverage: DiscoverySnapshotV1['coverage']): DiscoverySnapshotV1 => {
  const revision = sourceRevision(root, files)
  const base = {
    type: 'discovery-snapshot' as const,
    schemaVersion: 1 as const,
    contentHash: EMPTY_HASH,
    contentHashAlgo: 'sha256-normalized-v1' as const,
    project: { name: (entities.find((entity) => entity.kind === 'package' && entity.path === '.')?.name ?? basename(root)), root: '.' },
    sourceRevision: revision.value,
    sourceRevisionKind: revision.kind,
    configurationHash: configurationHashOf(config),
    pipelineVersion: PIPELINE_VERSION,
    analyzerVersions: ANALYZER_VERSIONS,
    entities: [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    relations: [...relations].sort((a, b) => a.id.localeCompare(b.id)),
    coverage: coverage.map((entry) => ({ ...entry, analyzerVersion: entry.analyzerVersion ?? (ANALYZER_VERSIONS[entry.analyzer] ?? '1.0.0') })),
  }
  return DiscoverySnapshotV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

export const discoverRepository = (opts: DiscoveryOptions = {}): DiscoverySnapshotV1 => {
  const root = resolve(opts.root ?? process.cwd())
  const safeOptions = safeWalkOptions(opts.config, {
    maxFiles: opts.maxFiles ?? opts.config?.safety?.maxFiles ?? DEFAULT_MAX_FILES,
    ...(opts.maxBytes !== undefined ? { maxBytes: opts.maxBytes } : {}),
  })
  const rootManifestPath = join(root, 'package.json')
  const rootManifest = readJson(rootManifestPath).value
  const packageResult = discoverPackages(root, rootManifest, opts.config)
  const sourceWalk = safeWalkFiles(root, { extensions: SOURCE_EXTENSIONS, ...safeOptions })
  const documentWalk = safeWalkFiles(root, { extensions: DOCUMENT_EXTENSIONS, ...safeOptions })
  const configWalk = safeWalkFiles(root, { extensions: CONFIG_EXTENSIONS, ...safeOptions })
  const sourcePaths = sourceWalk.files
  const documentPaths = documentWalk.files
  const configPaths = configWalk.files
    .filter((path) => /(?:^|\/)(?:tsconfig|jsconfig|vite\.config|webpack\.config|rollup\.config|next\.config|jest\.config|eslint\.config|vitest\.config)/.test(relativePath(root, path)))
  const allFiles = [...new Set([rootManifestPath, ...sourcePaths, ...documentPaths, ...configPaths].filter(existsSync))].sort()

  const entities = new Map<string, KnowledgeEntity>()
  const relations = new Map<string, KnowledgeRelation>()
  const addEntity = (entity: KnowledgeEntity): void => {
    const existing = entities.get(entity.id)
    if (existing && (existing.kind !== entity.kind || existing.path !== entity.path)) throw new Error(`Entity identity collision for "${entity.id}".`)
    entities.set(entity.id, existing ?? entity)
  }
  const addRelation = (relation: KnowledgeRelation): void => {
    const existing = relations.get(relation.id)
    if (!existing) {
      relations.set(relation.id, relation)
      return
    }
    const evidence = new Map(
      [...existing.evidence, ...relation.evidence].map((item) => [
        `${item.path}:${item.lineStart ?? ''}:${item.lineEnd ?? ''}:${item.source}`,
        item,
      ]),
    )
    relations.set(relation.id, { ...existing, evidence: [...evidence.values()] })
  }

  for (const pkg of packageResult.packages) {
    const text = readFileSync(pkg.manifestPath, 'utf8')
    addEntity({
      id: pkg.id,
      kind: 'package',
      name: pkg.name ?? pkg.path,
      path: pkg.path,
      provenance: 'observed',
      evidence: [
        {
          ...lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, '"name"')),
          contentHash: fileContentHash(text),
        },
      ],
    })
  }

  const compiler = readCompilerOptions(root)
  /*
   * What the previous scan already knows.
   *
   * Indexed before anything is parsed, because the decision to parse a file at all depends on
   * whether its hash matches what that scan recorded.
   */
  const ledger = emptyLedger()
  const refusal = opts.previous
    ? reuseRefusal(opts.previous, { pipelineVersion: PIPELINE_VERSION, analyzerVersions: ANALYZER_VERSIONS, configurationHash: configurationHashOf(opts.config) })
    : undefined
  if (refusal) ledger.invalidated.push(refusal)
  const prior = opts.previous && !refusal ? indexPriorSnapshot(opts.previous, compiler.options) : undefined

  /*
   * Whether a reference can resolve differently than it did last time.
   *
   * A module's own bytes decide its entity; what it resolves *to* depends on which modules and
   * packages exist and on the compiler options that turn a specifier into a path. If any of that
   * moved, nothing is reused however unchanged a file is — an import of `./new.js` resolved to
   * nothing yesterday and resolves to a module today. Reusing the entity alone would save no
   * parse, because the pass that reads references would have to build the tree regardless.
   */
  const moduleUniverse = moduleUniverseFingerprint({
    modulePaths: sourcePaths.map((absPath) => relativePath(root, absPath)),
    packages: packageResult.packages.map((pkg) => ({ id: pkg.id, path: pkg.path, ...(pkg.name ? { name: pkg.name } : {}) })),
    compilerOptions: compiler.options,
  })
  const reuseModuleRelations = Boolean(prior) && prior?.moduleUniverse === moduleUniverse
  if (prior && !reuseModuleRelations) {
    ledger.invalidated.push('the set of modules, packages or compiler options changed')
  }

  const modules = new Map<string, ModuleInfo>()
  const modulesByPath = new Map<string, string>()
  const reusedModules = new Set<string>()
  const areaModules: AreaModule[] = []
  const declaringModules = new Map<string, string[]>()
  const exportingModules = new Map<string, string[]>()
  const registerSymbols = (id: string, exports: readonly string[], declared: ReadonlySet<string>): void => {
    for (const name of exports) {
      if (name === '*' || name === 'default') continue
      const owners = declared.has(name) ? declaringModules : exportingModules
      const existing = owners.get(name)
      if (existing) existing.push(id)
      else owners.set(name, [id])
    }
  }

  for (const absPath of sourcePaths) {
    const path = relativePath(root, absPath)
    const pkg = packageForModule(packageResult.packages, absPath)
    const id = entityId('module', path)
    const text = readFileSync(absPath, 'utf8')
    const contentHash = fileContentHash(text)
    modules.set(resolve(absPath), { absPath, path, entityId: id, ...(pkg ? { packageId: pkg.id } : {}) })
    modulesByPath.set(path, id)
    if (pkg) areaModules.push({ moduleId: id, path, packageId: pkg.id, packagePath: pkg.path })

    const priorModule = reuseModuleRelations ? prior?.modules.get(path) : undefined
    if (priorModule && priorModule.contentHash === contentHash) {
      /*
       * The file is byte-identical to the one that produced this entity, so the entity is the
       * answer — no syntax tree needed. Which names it declares as opposed to forwards is read
       * back from `reexports`, because that distinction only exists in the tree.
       */
      addEntity(priorModule.entity)
      reusedModules.add(path)
      ledger.reusedEntities += 1
      registerSymbols(id, exportsOf(priorModule.entity), new Set(declaredExportsOf(priorModule.entity)))
    } else {
      const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, scriptKind(absPath))
      const exports = exportedNames(sourceFile)
      const declared = new Set(exportedNames(sourceFile, { declaredOnly: true }))
      const reexports = exports.filter((name) => !declared.has(name))
      registerSymbols(id, exports, declared)
      addEntity({
        id,
        kind: 'module',
        name: basename(absPath),
        path,
        provenance: 'observed',
        evidence: [
          {
            ...lineEvidence('code', root, absPath, 1, sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1),
            contentHash,
          },
        ],
        ...(exports.length
          ? { metadata: { exports, ...(reexports.length ? { reexports } : {}), test: TEST_MODULE_PATTERN.test(path) } }
          : {}),
      })
    }
    if (pkg) addRelation({ id: entityId('relation', `${pkg.id}:contains:${id}`), kind: 'contains', from: pkg.id, to: id, provenance: 'observed', evidence: [lineEvidence('code', root, absPath, 1)] })
  }

  /*
   * Areas: the directory level between a package and a file.
   *
   * Derived from convention and from what an ownership record already names, then attached to the
   * graph with `contains` — package to area, area to its nested areas, area to module. Each
   * module belongs to exactly one area, the most specific one, so an aggregation at area scope
   * has one answer per module.
   */
  const areas = deriveAreas({
    modules: areaModules,
    ownership: Object.entries(opts.config?.routing?.options?.ownership ?? {}).map(([id, record]) => ({ id, path: record.path })),
    ...(opts.config?.analysis?.areas?.depth !== undefined ? { depth: opts.config.analysis.areas.depth } : {}),
    ...(opts.config?.analysis?.areas?.roots !== undefined ? { roots: opts.config.analysis.areas.roots } : {}),
    ...(opts.config?.analysis?.areas?.exclude !== undefined ? { exclude: opts.config.analysis.areas.exclude } : {}),
  })
  const areasById = new Map(areas.map((area) => [area.id, area]))
  const areasByPath = new Map(areas.map((area) => [area.path, area.id]))

  for (const area of areas) {
    addEntity({
      id: area.id,
      kind: 'area',
      name: area.name,
      path: area.path,
      provenance: 'observed',
      evidence: [
        {
          source: 'derived',
          path: area.path,
          context: `Directory groups ${area.moduleIds.length} module(s).`,
        },
      ],
      metadata: {
        moduleCount: area.moduleIds.length,
        ...(area.ownershipId ? { ownershipId: area.ownershipId } : {}),
      },
    })

    const parent = area.parentId && areasById.has(area.parentId) ? area.parentId : area.packageId
    addRelation({
      id: entityId('relation', `${parent}:contains:${area.id}`),
      kind: 'contains',
      from: parent,
      to: area.id,
      provenance: 'observed',
      evidence: [{ source: 'derived', path: area.path }],
    })
    for (const moduleId of area.moduleIds) {
      addRelation({
        id: entityId('relation', `${area.id}:contains:${moduleId}`),
        kind: 'contains',
        from: area.id,
        to: moduleId,
        provenance: 'observed',
        evidence: [{ source: 'derived', path: area.path }],
      })
    }
  }

  /*
   * A symbol resolves to the module that declares it. Only when nothing declares it — a type
   * forwarded through a barrel, say — do the re-exporting modules stand in, and then only if
   * there is exactly one of them.
   */
  const symbolModules = new Map<string, readonly string[]>()
  for (const [name, owners] of declaringModules) symbolModules.set(name, owners)
  for (const [name, owners] of exportingModules) if (!symbolModules.has(name)) symbolModules.set(name, owners)

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
  const willExist = (id: string): boolean => entities.has(id) || plannedIds.has(id)

  /**
   * Put a reused entity's edges back.
   *
   * An edge whose internal target is gone is dropped — the file it pointed at was renamed or
   * deleted, and a graph that keeps the edge is lying about the repository. An external or
   * unresolved endpoint is re-created instead, because such an entity is in the snapshot only
   * because something referenced it, and that something is exactly what was reused.
   */
  const replayRelations = (prior: PriorFile): readonly KnowledgeRelation[] => {
    const replay = replayableRelations(prior.outgoing, willExist)
    for (const id of replay.missingEndpoints) {
      if (entities.has(id)) continue
      const relation = prior.outgoing.find((item) => item.to === id)
      addEntity({
        id,
        kind: id.startsWith('external:') ? 'external' : 'unresolved-reference',
        name: id.replace(/^(?:external|unresolved):/, ''),
        provenance: 'observed',
        evidence: relation?.evidence[0] ? [relation.evidence[0]] : [],
      })
    }
    for (const relation of replay.relations) addRelation(relation)
    return replay.relations
  }

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
  const reuseDocumentRelations = Boolean(prior) && prior?.resolution === resolution
  if (prior && reuseModuleRelations && !reuseDocumentRelations) {
    ledger.invalidated.push('the set of documents, areas or exported symbols changed')
  }

  const reusedDocuments = new Map<string, PriorFile>()
  for (const [path, absPath] of documentFiles) {
    let text: string
    try {
      text = readFileSync(absPath, 'utf8')
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

  const coverage: DiscoverySnapshotV1['coverage'] = [
    ...[sourceWalk, documentWalk, configWalk].flatMap((walk, index) => walk.incomplete ? [{ analyzer: 'repository', scope: `limits:${['source', 'documentation', 'configuration'][index]}`, status: 'partial' as const, reason: walk.reason }] : []),
    { analyzer: 'repository', scope: 'package-manager', status: hasPackageManagerMetadata(root, rootManifest) ? 'complete' : 'partial', ...(!hasPackageManagerMetadata(root, rootManifest) ? { reason: `No package manager metadata found; default helper would fall back to ${detectPackageManager(root)}.` } : {}) },
    { analyzer: 'repository', scope: 'workspace-packages', status: packageResult.coverage.some((item) => item.status === 'partial') ? 'partial' : 'complete', ...(packageResult.coverage.find((item) => item.reason)?.reason ? { reason: packageResult.coverage.find((item) => item.reason)?.reason } : {}) },
    { analyzer: 'js-ts', scope: 'static-imports-and-exports', status: compiler.error ? 'partial' : 'complete', ...(compiler.error ? { reason: compiler.error } : {}) },
    { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-applicable', reason: 'No dynamic loading expression was observed.' },
    { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'not-applicable', reason: 'No configured runtime-wiring call was observed.' },
    { analyzer: 'js-ts', scope: 'generated-code', status: 'not-analyzed', reason: 'Generated code is not interpreted as source architecture.' },
  ]

  /*
   * What the documentation says, as edges.
   *
   * A link to another document, a path in inline code, an exported name in backticks: each is a
   * claim the repository makes about itself, with a line number to check it against. Package
   * names resolve by their manifest name and, when unambiguous, by their directory name.
   */
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
    documents: documentsByPath,
    modules: modulesByPath,
    // Areas exist now, so a document naming a directory resolves to the unit, not to nothing.
    areas: areasByPath,
    packages: packageNames,
    symbols: symbolModules,
    // One index for the whole run: the analyzer used to rebuild this per document.
    pathIndex: markdownPathCandidateIndex({ documents: documentsByPath, modules: modulesByPath, areas: areasByPath }),
  }
  type MarkdownNote = { readonly scope: string; readonly reason: string; readonly evidence: readonly Evidence[] }
  const notesByDocument = new Map<string, readonly MarkdownNote[]>()
  const truncatedDocuments = new Set<string>()
  for (const document of markdownDocuments) {
    const analysis = analyzeMarkdownDocument(document, entityId('document', document.path), markdownResolution)
    for (const relation of analysis.relations) addRelation(relation)
    notesByDocument.set(document.path, analysis.notes)
    if (analysis.truncated) truncatedDocuments.add(document.path)
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

  const parsedDocuments = new Map(markdownDocuments.map((document) => [document.path, document]))
  for (const [path, absPath] of documentFiles) {
    const reused = reusedDocuments.get(path)
    if (reused) {
      addEntity(reused.entity)
      continue
    }
    const parsed = parsedDocuments.get(path)
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
        classification: (parsed && declaredAudience(parsed.frontmatter)) ?? documentClassification(path),
        ...(parsed?.title ? { title: parsed.title } : {}),
        ...(parsed?.headings.length ? { headings: parsed.headings } : {}),
        ...(parsed?.summary ? { summary: parsed.summary } : {}),
        ...(parsed ? { wordCount: parsed.wordCount } : {}),
        ...(parsed && Object.keys(parsed.frontmatter).length ? { frontmatter: parsed.frontmatter } : {}),
        ...(parsed?.generatedRegions.length ? { generatedRegions: parsed.generatedRegions } : {}),
        ...(truncatedDocuments.has(path) ? { evidenceTruncated: true } : {}),
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

  for (const pkg of packageResult.packages) {
    const text = readFileSync(pkg.manifestPath, 'utf8')
    for (const dependency of dependencyEntries(pkg.manifest)) {
      const target = packageResult.packages.find((candidate) => candidate.name === dependency.name)?.id ?? entityId('external', dependency.name)
      if (!entities.has(target)) addEntity({ id: target, kind: 'external', name: dependency.name, provenance: 'observed', evidence: [lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, `"${dependency.name}"`))] })
      addRelation({ id: entityId('relation', `${pkg.id}:depends-on:${target}:${dependency.type}`), kind: 'depends-on', from: pkg.id, to: target, provenance: 'observed', evidence: [lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, `"${dependency.name}"`))], metadata: { dependencyType: dependency.type } })
    }
  }

  const dynamicCoverageIndex = coverage.findIndex((entry) => entry.scope === 'dynamic-imports')
  const configuredRuntimeWiringMethods = new Set([
    ...(opts.config?.analysis?.jsTs?.runtimeWiringMethods ?? []),
    ...(opts.config?.analysis?.jsTs?.runtimeWiringAdapters?.flatMap((adapter) => adapter.methods) ?? []),
  ])
  if (!configuredRuntimeWiringMethods.size) for (const method of DEFAULT_RUNTIME_WIRING_METHODS) configuredRuntimeWiringMethods.add(method)
  const includeTestRuntimeWiring = opts.config?.analysis?.jsTs?.includeTestRuntimeWiring ?? false
  let observedLiteralDynamic = false
  let observedUnresolvedDynamic = false
  const observedDynamicEvidence: Evidence[] = []
  let observedRuntimeWiring = false
  let observedUnresolvedRuntimeWiring = false
  for (const module of modules.values()) {
    const priorModule = prior?.modules.get(module.path)
    if (reuseModuleRelations && priorModule && reusedModules.has(module.path)) {
      // Replay what this module said last time, then the facts the aggregate entries are built from.
      replayRelations(priorModule)

      const dynamicEntry = priorModule.coverage.find((entry) => entry.scope === `dynamic-imports:${module.path}`)
      const wiringEntry = priorModule.coverage.find((entry) => entry.scope === `runtime-wiring:${module.path}`)
      if (dynamicEntry) {
        coverage.push(dynamicEntry)
        observedUnresolvedDynamic ||= dynamicEntry.status === 'not-analyzed'
        observedLiteralDynamic ||= dynamicEntry.status === 'complete'
        observedDynamicEvidence.push(...(dynamicEntry.evidence ?? []))
      }
      if (wiringEntry) {
        coverage.push(wiringEntry)
        observedRuntimeWiring = true
        observedUnresolvedRuntimeWiring ||= wiringEntry.status === 'not-analyzed'
      }
      ledger.skippedFiles.push(module.path)
      continue
    }

    const text = readFileSync(module.absPath, 'utf8')
    const sourceFile = ts.createSourceFile(module.absPath, text, ts.ScriptTarget.Latest, true, scriptKind(module.absPath))
    const runtimeWiringMethods = includeTestRuntimeWiring || !TEST_MODULE_PATTERN.test(module.path) ? configuredRuntimeWiringMethods : new Set<string>()
    const references = moduleReferences(root, module.absPath, sourceFile, runtimeWiringMethods)
    ledger.parsedFiles.push(module.path)
    observedLiteralDynamic ||= references.hasLiteralDynamic
    observedUnresolvedDynamic ||= references.hasDynamic
    observedDynamicEvidence.push(...references.dynamicEvidence)
    observedRuntimeWiring ||= references.hasRuntimeWiring
    observedUnresolvedRuntimeWiring ||= references.hasUnresolvedRuntimeWiring
    for (const reference of references.references) {
      const target = resolveReference(reference, module.absPath, modules, packageResult.packages, compiler.options)
      if (!target) continue
      if (!entities.has(target.targetId)) {
        const externalName = target.targetId.replace(/^external:/, '')
        addEntity({ id: target.targetId, kind: 'external', name: externalName, provenance: 'observed', evidence: [reference.evidence] })
      }
      addRelation({ id: entityId('relation', `${module.entityId}:${reference.kind}:${target.targetId}`), kind: reference.kind, from: module.entityId, to: target.targetId, provenance: 'observed', evidence: [reference.evidence], ...(reference.detection ? { metadata: { detection: reference.detection } } : {}) })
    }
    if (references.hasLiteralDynamic || references.hasDynamic) coverage.push({ analyzer: 'js-ts', scope: `dynamic-imports:${module.path}`, status: references.hasDynamic ? 'not-analyzed' : 'complete', reason: references.hasDynamic ? 'A non-literal dynamic import was found; the target is unresolved.' : 'Literal dynamic imports were resolved.', evidence: [...references.dynamicEvidence.slice(0, 32)] })
    /*
     * Every observed wiring call leaves a per-file record, resolved or not — the aggregate entry
     * below is derived from these, and a fact that exists only in a local variable cannot be
     * replayed by a scan that skipped the parse.
     */
    if (references.hasRuntimeWiring) coverage.push({ analyzer: 'js-ts', scope: `runtime-wiring:${module.path}`, status: references.hasUnresolvedRuntimeWiring ? 'not-analyzed' : 'complete', reason: references.hasUnresolvedRuntimeWiring ? 'A runtime registration/wiring call was found without a statically imported target.' : 'Configured runtime-wiring call(s) were found with statically known targets.', evidence: [lineEvidence('code', root, module.absPath)] })
  }

  if (dynamicCoverageIndex >= 0) coverage[dynamicCoverageIndex] = observedUnresolvedDynamic
    ? { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'partial', reason: 'Literal dynamic imports are resolved; non-literal import expressions and require calls remain unresolved. Evidence lists representative dynamic loading sites.', evidence: [...observedDynamicEvidence.slice(0, 32)] }
    : observedLiteralDynamic
      ? { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'complete', reason: 'All observed dynamic imports used literal targets and were resolved.', evidence: [...observedDynamicEvidence.slice(0, 32)] }
      : { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-applicable', reason: 'No dynamic loading expression was observed.' }
  const runtimeCoverageIndex = coverage.findIndex((entry) => entry.scope === 'runtime-wiring')
  if (runtimeCoverageIndex >= 0) coverage[runtimeCoverageIndex] = observedUnresolvedRuntimeWiring
    ? { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'partial', reason: 'Some configured runtime-wiring calls remain unresolved after static binding analysis.' }
    : observedRuntimeWiring
      ? { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'complete', reason: 'All observed configured runtime-wiring calls resolved to static bindings.' }
      : { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'not-applicable', reason: 'No configured runtime-wiring call was observed.' }

  /*
   * Community suggestions, last, because they need the finished import graph.
   *
   * A cluster of modules that move together is a hypothesis about where an area boundary might
   * be. It is reported as coverage — status `not-analyzed`, because whether the cluster is an area
   * is a question nobody has answered — and never as an area entity. A clustering algorithm does
   * not get to name the architecture.
   */
  coverage.push(
    ...areaSuggestionCoverage({ entities: [...entities.values()], relations: [...relations.values()] }),
  )

  /*
   * What this run reused, last, because only now is it known.
   *
   * A run that finishes in a tenth of the time has to be able to say why. This entry is the one
   * part of the snapshot that describes the run rather than the repository — the entities, the
   * relations and every other coverage entry are identical to what a cold scan would produce.
   */
  coverage.push(reuseCoverage(ledger))

  return artifact(root, opts.config, allFiles, [...entities.values()], [...relations.values()], coverage)
}

export type { DiscoveryOptions }
