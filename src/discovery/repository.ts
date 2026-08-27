import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import * as ts from 'typescript'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { expandWorkspaceGlobs } from '../lib/glob-expand.js'
import { detectPackageManager } from '../lib/package-manager.js'
import { toPosix } from '../lib/paths.js'
import { walkFiles } from '../lib/walk.js'
import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
import {
  DiscoverySnapshotV1Schema,
  type DiscoverySnapshotV1,
  type Evidence,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from '../schemas/knowledge.js'

const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'] as const
const DOCUMENT_EXTENSIONS = ['.md', '.mdx'] as const
const DEFAULT_MAX_FILES = 10_000
const EMPTY_HASH = '0'.repeat(64)

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
  readonly kind: 'imports' | 're-exports'
  readonly evidence: Evidence
}

type DiscoveryOptions = {
  readonly root?: string
  readonly config?: DocBridgeConfigV1
  readonly maxFiles?: number
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

const entityId = (kind: string, value: string): string => `${kind}:${value}`

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
    const parsed = readJson(manifestPath)
    if (!parsed.value) {
      coverage.push({ status: 'partial', reason: `${relativePath(root, manifestPath)}: ${parsed.error ?? 'invalid package.json'}` })
      continue
    }
    const path = relativePath(root, absPath)
    const name = packageName(parsed.value, path)
    const id = entityId('package', name ?? path)
    const duplicate = packages.find((pkg) => pkg.id === id)
    if (duplicate && duplicate.absPath !== absPath) {
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

const scriptKind = (path: string): ts.ScriptKind => {
  switch (extname(path)) {
    case '.js': return ts.ScriptKind.JS
    case '.jsx': return ts.ScriptKind.JSX
    case '.mjs': return ts.ScriptKind.JS
    case '.cjs': return ts.ScriptKind.JS
    case '.ts': return ts.ScriptKind.TS
    case '.tsx': return ts.ScriptKind.TSX
    case '.mts': return ts.ScriptKind.TS
    case '.cts': return ts.ScriptKind.TS
    default: return ts.ScriptKind.Unknown
  }
}

const nodeEvidence = (root: string, path: string, sourceFile: ts.SourceFile, node: ts.Node): Evidence => {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
  return lineEvidence('code', root, path, start, end)
}

const isExported = (node: ts.Node): boolean => {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

const exportedNames = (sourceFile: ts.SourceFile): string[] => {
  const names = new Set<string>()
  const addDeclarationName = (node: ts.Declaration): void => {
    if (!isExported(node)) return
    const name = ts.getNameOfDeclaration(node)
    if (name && ts.isIdentifier(name)) names.add(name.text)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) names.add('*')
      else if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) names.add(element.name.text)
      }
    } else if (ts.isExportAssignment(node)) {
      names.add('default')
    } else if (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      addDeclarationName(node)
    } else if (ts.isVariableStatement(node) && isExported(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...names].sort()
}

const moduleReferences = (
  root: string,
  path: string,
  sourceFile: ts.SourceFile,
): { readonly references: readonly ImportReference[]; readonly exports: readonly string[]; readonly hasDynamic: boolean; readonly hasRuntimeWiring: boolean } => {
  const references: ImportReference[] = []
  let hasDynamic = false
  let hasRuntimeWiring = false
  const addReference = (specifier: ts.StringLiteralLike, kind: ImportReference['kind'], node: ts.Node): void => {
    references.push({ specifier: specifier.text, kind, evidence: nodeEvidence(root, path, sourceFile, node) })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier, 'imports', node)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addReference(node.moduleSpecifier, 're-exports', node)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      addReference(node.moduleReference.expression, 'imports', node)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) hasDynamic = true
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteralLike(argument)) addReference(argument, 'imports', node)
        else hasDynamic = true
      } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'register') {
        hasRuntimeWiring = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return {
    references,
    exports: exportedNames(sourceFile),
    hasDynamic,
    hasRuntimeWiring,
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
    configurationHash: sha256NormalizedV1(config ?? {}),
    pipelineVersion: '1.0.0',
    analyzerVersions: { repository: '1.0.0', 'js-ts': '1.0.0' },
    entities: [...entities].sort((a, b) => a.id.localeCompare(b.id)),
    relations: [...relations].sort((a, b) => a.id.localeCompare(b.id)),
    coverage: [...coverage],
  }
  return DiscoverySnapshotV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) })
}

export const discoverRepository = (opts: DiscoveryOptions = {}): DiscoverySnapshotV1 => {
  const root = resolve(opts.root ?? process.cwd())
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  const rootManifestPath = join(root, 'package.json')
  const rootManifest = readJson(rootManifestPath).value
  const packageResult = discoverPackages(root, rootManifest, opts.config)
  const sourcePaths = walkFiles(root, { extensions: SOURCE_EXTENSIONS, maxFiles })
  const documentPaths = walkFiles(root, { extensions: DOCUMENT_EXTENSIONS, maxFiles })
  const configPaths = walkFiles(root, { extensions: ['.json', '.yaml', '.yml', '.js', '.ts'], maxFiles })
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
    addEntity({ id: pkg.id, kind: 'package', name: pkg.name ?? pkg.path, path: pkg.path, provenance: 'observed', evidence: [lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, '"name"'))] })
  }

  const modules = new Map<string, ModuleInfo>()
  for (const absPath of sourcePaths) {
    const path = relativePath(root, absPath)
    const pkg = packageForModule(packageResult.packages, absPath)
    const id = entityId('module', path)
    const text = readFileSync(absPath, 'utf8')
    const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, scriptKind(absPath))
    const exports = exportedNames(sourceFile)
    modules.set(resolve(absPath), { absPath, path, entityId: id, ...(pkg ? { packageId: pkg.id } : {}) })
    addEntity({ id, kind: 'module', name: basename(absPath), path, provenance: 'observed', evidence: [lineEvidence('code', root, absPath, 1, sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1)], ...(exports.length ? { metadata: { exports, test: /(?:\.test|\.spec|__tests__)/.test(path) } } : {}) })
    if (pkg) addRelation({ id: entityId('relation', `${pkg.id}:contains:${id}`), kind: 'contains', from: pkg.id, to: id, provenance: 'observed', evidence: [lineEvidence('code', root, absPath, 1)] })
  }

  for (const absPath of documentPaths) {
    const path = relativePath(root, absPath)
    addEntity({ id: entityId('document', path), kind: 'document', name: basename(absPath), path, provenance: 'observed', evidence: [lineEvidence('documentation', root, absPath, 1)] })
  }

  const compiler = readCompilerOptions(root)
  const coverage: DiscoverySnapshotV1['coverage'] = [
    { analyzer: 'repository', scope: 'package-manager', status: hasPackageManagerMetadata(root, rootManifest) ? 'complete' : 'partial', ...(!hasPackageManagerMetadata(root, rootManifest) ? { reason: `No package manager metadata found; default helper would fall back to ${detectPackageManager(root)}.` } : {}) },
    { analyzer: 'repository', scope: 'workspace-packages', status: packageResult.coverage.some((item) => item.status === 'partial') ? 'partial' : 'complete', ...(packageResult.coverage.find((item) => item.reason)?.reason ? { reason: packageResult.coverage.find((item) => item.reason)?.reason } : {}) },
    { analyzer: 'js-ts', scope: 'static-imports-and-exports', status: compiler.error ? 'partial' : 'complete', ...(compiler.error ? { reason: compiler.error } : {}) },
    { analyzer: 'js-ts', scope: 'dynamic-imports', status: 'not-analyzed', reason: 'Dynamic import expressions and non-literal require calls are not resolved.' },
    { analyzer: 'js-ts', scope: 'runtime-wiring', status: 'not-analyzed', reason: 'Reflection, dependency injection and runtime wiring are not inferred.' },
    { analyzer: 'js-ts', scope: 'generated-code', status: 'not-analyzed', reason: 'Generated code is not interpreted as source architecture.' },
  ]

  for (const pkg of packageResult.packages) {
    const text = readFileSync(pkg.manifestPath, 'utf8')
    for (const dependency of dependencyEntries(pkg.manifest)) {
      const target = packageResult.packages.find((candidate) => candidate.name === dependency.name)?.id ?? entityId('external', dependency.name)
      if (!entities.has(target)) addEntity({ id: target, kind: 'external', name: dependency.name, provenance: 'observed', evidence: [lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, `"${dependency.name}"`))] })
      addRelation({ id: entityId('relation', `${pkg.id}:depends-on:${target}:${dependency.type}`), kind: 'depends-on', from: pkg.id, to: target, provenance: 'observed', evidence: [lineEvidence('configuration', root, pkg.manifestPath, firstLineContaining(text, `"${dependency.name}"`))], metadata: { dependencyType: dependency.type } })
    }
  }

  for (const module of modules.values()) {
    const text = readFileSync(module.absPath, 'utf8')
    const sourceFile = ts.createSourceFile(module.absPath, text, ts.ScriptTarget.Latest, true, scriptKind(module.absPath))
    const references = moduleReferences(root, module.absPath, sourceFile)
    for (const reference of references.references) {
      const target = resolveReference(reference, module.absPath, modules, packageResult.packages, compiler.options)
      if (!target) continue
      if (!entities.has(target.targetId)) {
        const externalName = target.targetId.replace(/^external:/, '')
        addEntity({ id: target.targetId, kind: 'external', name: externalName, provenance: 'observed', evidence: [reference.evidence] })
      }
      addRelation({ id: entityId('relation', `${module.entityId}:${reference.kind}:${target.targetId}`), kind: reference.kind, from: module.entityId, to: target.targetId, provenance: 'observed', evidence: [reference.evidence] })
    }
    if (references.hasDynamic) coverage.push({ analyzer: 'js-ts', scope: `dynamic-imports:${module.path}`, status: 'not-analyzed', reason: 'A dynamic import or non-literal require was found.', evidence: [lineEvidence('code', root, module.absPath)] })
    if (references.hasRuntimeWiring) coverage.push({ analyzer: 'js-ts', scope: `runtime-wiring:${module.path}`, status: 'not-analyzed', reason: 'A possible runtime registration/wiring call was found.', evidence: [lineEvidence('code', root, module.absPath)] })
  }

  return artifact(root, opts.config, allFiles, [...entities.values()], [...relations.values()], coverage)
}

export type { DiscoveryOptions }
