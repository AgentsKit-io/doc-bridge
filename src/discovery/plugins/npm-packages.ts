import { dirname, join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import semver from 'semver'
import { toPosix } from '../../lib/paths.js'
import { sha256NormalizedV1 } from '../../index-builder/content-hash.js'
import type { ScanIO } from '../scan-io.js'
import type { PackageInfo } from './js-ts.js'
import type { PackageFact } from '../../storage/facts.js'
import type { Coverage, Evidence } from '../../schemas/knowledge.js'
import { npmPurl, npmRangeToVers } from './npm-versions.js'
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']

/** Exact importer/node_modules lookup; no global name lookup across workspace owners. */
export const lockedNpmVersion = (filename: string, text: string, owner: string, name: string, section: string): string | undefined => {
  const data = record(filename === 'pnpm-lock.yaml' ? parseYaml(text) : JSON.parse(text))
  return lockedVersionFromData(filename, data, owner, name, section)
}
const lockedVersionFromData = (filename: string, data: Record<string, any>, owner: string, name: string, section: string): string | undefined => {
  if (filename === 'pnpm-lock.yaml') {
    const entry = record(record(record(data.importers)[owner])[section])[name]
    const version = typeof entry === 'string' ? entry : record(entry).version
    return typeof version === 'string' ? version.replace(/\(.*$/, '') : undefined
  }
  const packages = record(data.packages)
  const local = owner === '.' ? `node_modules/${name}` : `${owner}/node_modules/${name}`
  const entry = record(packages[local] ?? packages[`node_modules/${name}`])
  return typeof entry.version === 'string' ? entry.version : owner === '.' && typeof record(record(data.dependencies)[name]).version === 'string' ? record(record(data.dependencies)[name]).version : undefined
}
export const extractNpmPackages = (root: string, io: ScanIO, packages: readonly PackageInfo[]): { packages: PackageFact[]; coverage: Coverage[] } => {
  const facts: PackageFact[] = [], coverage: Coverage[] = []
  // Scan-local: a later scan must observe changed lockfiles, including repaired parse failures.
  const locks = new Map<string, Record<string, any> | undefined>()
  for (const pkg of packages) {
    const evidence: Evidence[] = [{ source: 'configuration', path: toPosix(relative(root, pkg.manifestPath)), contentHash: sha256NormalizedV1(io.readText(pkg.manifestPath)) }]
    let partial = false
    let purl: string
    try { if (!pkg.name) throw new Error('MISSING_NAME'); purl = npmPurl(pkg.name) } catch { coverage.push({ analyzer: 'js-ts', scope: 'manifest', status: 'partial', reason: 'Package has no valid npm name.', evidence }); continue }
    const lockPath = LOCKFILES.map(file => join(pkg.absPath, file)).find(io.exists) ?? LOCKFILES.map(file => join(root, file)).find(io.exists)
    const lockName = lockPath?.split(/[\\/]/).pop()
    let lockText: string | undefined
    if (lockPath) {
      lockText = io.readText(lockPath)
      evidence.push({ source: 'configuration', path: toPosix(relative(root, lockPath)), contentHash: sha256NormalizedV1(lockText) })
      if (lockName !== 'pnpm-lock.yaml' && lockName !== 'package-lock.json') partial = true
      else if (!locks.has(lockPath)) {
        try { locks.set(lockPath, record(lockName === 'pnpm-lock.yaml' ? parseYaml(lockText) : JSON.parse(lockText))) }
        catch { locks.set(lockPath, undefined) }
      }
    }
    const dependencies = new Map<string, PackageFact['dependencies'][number]>()
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const [name, raw] of Object.entries(record(pkg.manifest[section]))) {
      try {
        const depPurl = npmPurl(name)
        if (typeof raw !== 'string' || raw.length > 512) { partial = true; continue }
        const translated = npmRangeToVers(raw)
        const range = raw.startsWith('workspace:') ? raw : translated.status === 'resolved' ? translated.value : `vers:npm/${encodeURIComponent(raw).slice(0, 480)}`
        if (translated.status !== 'resolved' && !raw.startsWith('workspace:')) partial = true
        let lockedVersion: string | undefined
        if (lockPath) {
          try {
            const owner = dirname(lockPath) === pkg.absPath ? '.' : pkg.path
            const data = locks.get(lockPath)
            lockedVersion = data ? lockedVersionFromData(lockName!, data, owner, name, section) : undefined
          } catch { partial = true }
          if (!lockedVersion || !semver.valid(lockedVersion)) { partial = true; lockedVersion = 'unresolved' }
        }
        const next = { purl: depPurl, range, ...(lockedVersion ? { lockedVersion } : {}) }
        const prior = dependencies.get(depPurl)
        if (prior && (prior.range !== range || prior.lockedVersion !== lockedVersion)) { partial = true; dependencies.set(depPurl, { purl: depPurl, range: 'vers:npm/unresolved', ...(lockPath ? { lockedVersion: 'unresolved' } : {}) }) }
        else dependencies.set(depPurl, next)
      } catch { partial = true }
    }
    const version = typeof pkg.manifest.version === 'string' && semver.valid(pkg.manifest.version) ? pkg.manifest.version : undefined
    if (pkg.manifest.version !== undefined && !version) partial = true
    facts.push({ id: pkg.id, purl, ...(version ? { version } : {}), dependencies: [...dependencies.values()].sort((a,b) => a.purl.localeCompare(b.purl)), evidence })
    coverage.push({ analyzer: 'js-ts', scope: 'manifest', status: partial ? 'partial' : 'complete', ...(partial ? { reason: 'Unsupported or unresolved package version, range or lockfile entry.' } : {}), evidence })
    if (lockPath) coverage.push({ analyzer: 'js-ts', scope: 'lockfile', status: partial ? 'partial' : 'complete', ...(partial ? { reason: 'Only pnpm importers and npm node_modules lock entries are supported; missing entries stay unresolved.' } : {}), evidence: [evidence[1]!] })
  }
  return { packages: facts, coverage }
}
