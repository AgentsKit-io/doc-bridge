import { signatureContext, signatureEntryPoints } from '../facts/signature-context.js'
import { extractNpmPackages } from './npm-packages.js'
import { npmVersionHooks } from './npm-versions.js'
import { FACT_EXTRACTORS, runFactExtractors } from '../facts/index.js'
import { builtInManifest, pluginScan, extractionGraph, extractionOutput } from './built-in.js'
import type { DiscoveryPluginV2 } from '../../plugins/contract.js'
import { CONFIG_EXTENSIONS, safeWalkOptions } from '../inputs.js'
import type { SafeWalkOptions, SafeWalkResult } from '../../safety/repository.js'

import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import * as ts from 'typescript'
import type { DocBridgeConfigV1 } from '../../config/schema.js'
import type { DiscoveryOptions } from '../repository.js'
import { PIPELINE_VERSION, ANALYZER_VERSIONS } from '../repository.js'
import type { ScanIO } from '../scan-io.js'
import { toPosix } from '../../lib/paths.js'
import { sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import { entityId } from '../identity.js'
import { emptyLedger, exportsOf, declaredExportsOf, fileContentHash, indexPriorSnapshot, moduleUniverseFingerprint, reuseRefusal, type PriorFile } from '../incremental.js'
import { SOURCE_EXTENSIONS, exportedNames, scriptKind } from '../inputs.js'
import type { DiscoverySnapshotV1, Evidence, KnowledgeEntity, KnowledgeRelation } from '../../schemas/knowledge.js'
import type { AreaModule } from '../areas.js'
export type JsonRecord = Record<string, unknown>

export type PackageInfo = {
  readonly id: string
  readonly name?: string
  readonly path: string
  readonly absPath: string
  readonly manifestPath: string
  readonly manifest: JsonRecord
}

export type ModuleInfo = {
  readonly absPath: string
  readonly path: string
  readonly entityId: string
  readonly packageId?: string
}

export type ImportReference = {
  readonly specifier: string
  readonly kind: 'imports' | 're-exports' | 'runtime-wiring'
  readonly evidence: Evidence
  readonly detection?: 'dynamic-literal' | 'runtime-wiring-static'
}

export type ExtractionGraph = {
  entities: Map<string, KnowledgeEntity>
  relations: Map<string, KnowledgeRelation>
  addEntity: (entity: KnowledgeEntity) => void
  addRelation: (relation: KnowledgeRelation) => void
}
export type SourceContext = ExtractionGraph & {
  root: string
  opts: DiscoveryOptions
  sourcePaths: readonly string[]
  packageResult: { readonly packages: readonly PackageInfo[]; readonly coverage: readonly { status: 'complete' | 'partial'; reason?: string }[] }
}
const DEFAULT_RUNTIME_WIRING_METHODS = ['register', 'use', 'mount', 'attach'] as const
const TEST_MODULE_PATTERN = /(?:\.test|\.spec|__tests__)/
const configurationHashOf = (config: DiscoveryOptions['config']): string => sha256NormalizedV1(config ?? {})
export const createJsTsExtraction = (io: ScanIO, retainTrees = true) => {
const hasPackageManagerMetadata = (root: string, rootManifest: JsonRecord | undefined): boolean =>
  Boolean(
    rootManifest?.packageManager ||
      io.exists(join(root, 'pnpm-lock.yaml')) ||
      io.exists(join(root, 'pnpm-workspace.yaml')) ||
      io.exists(join(root, 'yarn.lock')) ||
      io.exists(join(root, 'bun.lock')) ||
      io.exists(join(root, 'bun.lockb')) ||
      io.exists(join(root, 'package-lock.json')),
  )



const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readJson = (path: string): { readonly value?: JsonRecord; readonly error?: string } => {
  try {
    const value: unknown = JSON.parse(io.readText(path))
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
  if (!io.exists(workspacePath)) return []
  const patterns: string[] = []
  let inPackages = false
  for (const line of io.readText(workspacePath).split(/\r?\n/)) {
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

  const dirs = io.workspaceDirectories(patterns)
  for (const absPath of dirs) {
    const manifestPath = join(absPath, 'package.json')
    if (!io.exists(manifestPath)) continue
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

const readCompilerOptions = (root: string): { readonly options: ts.CompilerOptions; readonly error?: string; readonly unsupported?: readonly { scope: string; reason: string }[] } => {
  const configPath = ts.findConfigFile(root, io.host.fileExists, 'tsconfig.json')
  if (!configPath) return { options: {} }
  const parsed = ts.readConfigFile(configPath, io.host.readFile)
  if (parsed.error) return { options: {}, error: ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n') }
  const config = ts.parseJsonConfigFileContent(parsed.config, io.host, dirname(configPath))
  const unsupported: { scope: string; reason: string }[] = []
  const outside = (path: string): boolean => {
    const rel = relative(root, resolve(path))
    return rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== resolve(path)
  }
  const pathsBase = typeof config.options.pathsBasePath === 'string' ? config.options.pathsBasePath : dirname(configPath)
  const base = config.options.baseUrl ?? pathsBase
  if (config.options.baseUrl && outside(base)) unsupported.push({ scope: 'configuration:baseUrl', reason: 'Compiler baseUrl is outside the repository partition.' })
  for (const [name, targets] of Object.entries(config.options.paths ?? {})) {
    for (const [index, target] of targets.entries()) if (outside(resolve(base, target))) unsupported.push({ scope: `configuration:paths:${name}:${index}`, reason: 'Compiler path mapping is outside the repository partition.' })
  }
  for (const [index, directory] of (config.options.rootDirs ?? []).entries()) if (outside(directory)) unsupported.push({ scope: `configuration:rootDirs:${index}`, reason: 'Compiler root directory is outside the repository partition.' })
  return {
    options: config.options,
    ...(config.errors.length ? { error: ts.flattenDiagnosticMessageText(config.errors[0]?.messageText ?? 'Invalid tsconfig', '\n') } : {}),
    ...(unsupported.length ? { unsupported } : {}),
  }
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

  const resolved = ts.resolveModuleName(reference.specifier, containingFile, compilerOptions, io.host).resolvedModule?.resolvedFileName
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


  const prepare = ({ root, opts, sourcePaths, packageResult, entities, relations, addEntity, addRelation }: SourceContext) => {
  for (const pkg of packageResult.packages) {
    const text = io.readText(pkg.manifestPath)
    const entryPoints = signatureEntryPoints(pkg.manifest)
    addEntity({
      id: pkg.id,
      kind: 'package',
      name: pkg.name ?? pkg.path,
      path: pkg.path,
      ...(pkg.manifest.bin !== undefined || entryPoints ? { metadata: { ...(pkg.manifest.bin !== undefined ? { cliBin: pkg.manifest.bin } : {}), ...(entryPoints ? { signatureEntryPoints: entryPoints } : {}) } } : {}),
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

  const sourceFiles = new Map<string, ts.SourceFile>()
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
    const text = io.readText(absPath)
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
      if (retainTrees) sourceFiles.set(path, sourceFile)
      const exports = exportedNames(sourceFile)
      const declared = new Set(exportedNames(sourceFile, { declaredOnly: true }))
      const reexports = exports.filter((name) => !declared.has(name))
      registerSymbols(id, exports, declared)
      const context = signatureContext(sourceFile)
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
        metadata: { ...(exports.length ? { exports, ...(reexports.length ? { reexports } : {}), test: TEST_MODULE_PATTERN.test(path) } : {}), signatureContext: context ?? null },
      })
    }
    if (pkg) addRelation({ id: entityId('relation', `${pkg.id}:contains:${id}`), kind: 'contains', from: pkg.id, to: id, provenance: 'observed', evidence: [lineEvidence('code', root, absPath, 1)] })
  }

  /*
   * A symbol resolves to the module that declares it. Only when nothing declares it — a type
   * forwarded through a barrel, say — do the re-exporting modules stand in, and then only if
   * there is exactly one of them.
   */
  const symbolModules = new Map<string, readonly string[]>()
  for (const [name, owners] of declaringModules) symbolModules.set(name, owners)
  for (const [name, owners] of exportingModules) if (!symbolModules.has(name)) symbolModules.set(name, owners)

    return { sourceFiles, compiler, ledger, prior, moduleUniverse, reuseModuleRelations, modules, modulesByPath, reusedModules, areaModules, symbolModules }
  }
  const finish = ({ root, opts, packageResult, entities, relations, addEntity, addRelation, coverage, sourceFiles, compiler, prior, modules, reuseModuleRelations, reusedModules, ledger, replayRelations }: Omit<SourceContext, 'sourcePaths'> & ReturnType<typeof prepare> & { coverage: DiscoverySnapshotV1['coverage']; replayRelations: (prior: PriorFile) => readonly KnowledgeRelation[] }) => {
  for (const pkg of packageResult.packages) {
    const text = io.readText(pkg.manifestPath)
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

    const text = io.readText(module.absPath)
    const sourceFile = sourceFiles.get(module.path) ?? ts.createSourceFile(module.absPath, text, ts.ScriptTarget.Latest, true, scriptKind(module.absPath))
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

  }
  const inputs = (root: string, opts: DiscoveryOptions, safeOptions: SafeWalkOptions) => {
    const rootManifestPath = join(root, 'package.json')
    const rootManifest = readJson(rootManifestPath).value
    const packageResult = discoverPackages(root, rootManifest, opts.config)
    const sourceWalk = io.walk(SOURCE_EXTENSIONS, safeOptions)
    const configWalk = io.walk(CONFIG_EXTENSIONS, safeOptions)
    const sourcePaths = sourceWalk.files
    const configPaths = configWalk.files.filter(path => /(?:^|\/)(?:tsconfig|jsconfig|vite\.config|webpack\.config|rollup\.config|next\.config|jest\.config|eslint\.config|vitest\.config)/.test(relativePath(root, path)))
    return { rootManifest, packageResult, sourceWalk, configWalk, sourcePaths, inputFiles: [rootManifestPath, ...packageResult.packages.map(pkg => pkg.manifestPath), ...io.walk(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'], safeOptions).files, ...sourcePaths, ...configPaths] }
  }
  const initialCoverage = (root: string, rootManifest: JsonRecord | undefined, packageResult: SourceContext['packageResult'], compiler: ReturnType<typeof readCompilerOptions>, walks: readonly SafeWalkResult[]): DiscoverySnapshotV1['coverage'] => {
  const coverage: DiscoverySnapshotV1['coverage'] = [
    ...walks.flatMap((walk, index) => walk.incomplete ? [{ analyzer: 'repository', scope: `limits:${['source', 'documentation', 'configuration'][index]}`, status: 'partial' as const, reason: walk.reason }] : []),
    { analyzer: 'repository', scope: 'package-manager', status: hasPackageManagerMetadata(root, rootManifest) ? 'complete' : 'partial', ...(!hasPackageManagerMetadata(root, rootManifest) ? { reason: `No package manager metadata found; default helper would fall back to ${io.packageManager()}.` } : {}) },
    { analyzer: 'repository', scope: 'workspace-packages', status: packageResult.coverage.some((item) => item.status === 'partial') ? 'partial' : 'complete', ...(packageResult.coverage.find((item) => item.reason)?.reason ? { reason: packageResult.coverage.find((item) => item.reason)?.reason } : {}) },
    { analyzer: 'js-ts', scope: 'static-imports-and-exports', status: compiler.error ? 'partial' : 'complete', ...(compiler.error ? { reason: compiler.error } : {}) },
    ...(compiler.unsupported ?? []).map(entry => ({ analyzer: 'js-ts', scope: entry.scope, status: 'not-analyzed' as const, reason: entry.reason })),
    { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-applicable', reason: 'No dynamic loading expression was observed.' },
    { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'not-applicable', reason: 'No configured runtime-wiring call was observed.' },
    { analyzer: 'js-ts', scope: 'generated-code', status: 'not-analyzed', reason: 'Generated code is not interpreted as source architecture.' },
  ]

    return coverage
  }
  return { extractPackages: (root: string, packages: readonly PackageInfo[]) => extractNpmPackages(root, io, packages), manifest: jsTsManifest, inputs, initialCoverage, readJson, discoverPackages, relativePath, prepare, finish }
}
export type SourceState = ReturnType<ReturnType<typeof createJsTsExtraction>['prepare']>

const baseManifest = builtInManifest('js-ts', '1.5.0', [...new Set([...SOURCE_EXTENSIONS, ...CONFIG_EXTENSIONS])].map(extension => `**/*${extension}`))
const factCapabilities = { symbol: 'symbols', 'cli-command': 'cli-commands', 'cli-flag': 'cli-flags', 'config-key': 'config-keys', signature: 'signatures' } as const
export const jsTsManifest = { ...baseManifest, capabilities: [...new Set([...baseManifest.capabilities, 'lockfile' as const, 'versions' as const, 'release-map' as const, ...FACT_EXTRACTORS.flatMap(extractor => extractor.kinds.map(kind => factCapabilities[kind]))])] }
export const createJsTsPluginV2 = (): DiscoveryPluginV2 => ({
  manifest: jsTsManifest,
  ...npmVersionHooks,
  async discover(input) {
    const { root, opts, io } = await pluginScan(input)
    const analyzer = createJsTsExtraction(io)
    const packageResult = analyzer.discoverPackages(root, analyzer.readJson(join(root, 'package.json')).value, opts.config)
    const sourcePaths = io.walk(SOURCE_EXTENSIONS, safeWalkOptions(opts.config)).files
    const graph = extractionGraph()
    const source = analyzer.prepare({ root, opts, sourcePaths, packageResult, ...graph })
    const coverage: DiscoverySnapshotV1['coverage'] = [
      { analyzer: 'js-ts', scope: 'static-imports-and-exports', status: source.compiler.error ? 'partial' : 'complete', ...(source.compiler.error ? { reason: source.compiler.error } : {}) },
      { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-applicable', reason: 'No dynamic loading expression was observed.' },
      { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'not-applicable', reason: 'No configured runtime-wiring call was observed.' },
      { analyzer: 'js-ts', scope: 'generated-code', status: 'not-analyzed', reason: 'Generated code is not interpreted as source architecture.' },
    ]
    analyzer.finish({ root, opts, packageResult, ...graph, ...source, coverage, replayRelations: () => [] })
    const output = runFactExtractors({ root, io, modules: source.modules, parsedTrees: source.sourceFiles, packages: packageResult.packages, walkOptions: safeWalkOptions(opts.config) })
    const versions = extractNpmPackages(root, io, packageResult.packages)
    return { ...extractionOutput(graph, [...coverage, ...output.coverage, ...versions.coverage]), facts: output.facts, packages: versions.packages }
  },
})
