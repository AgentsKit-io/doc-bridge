import { PackageURL } from 'packageurl-js'
import semver from 'semver'
import type { DiscoveryPluginV2, ReleaseEvent, Resolution } from '../../plugins/contract.js'
import type { PackageFact } from '../../storage/facts.js'

const resolved = <T>(value: T): Resolution<T> => ({ status: 'resolved', value, evidence: [] })
const unresolved = (reason: string): Resolution<never> => ({ status: 'unresolved', reason, evidence: [] })
export const npmPurl = (name: string): string => {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)) throw new Error('INVALID_NPM_NAME')
  const slash = name.indexOf('/')
  return new PackageURL('npm', slash < 0 ? undefined : name.slice(0, slash), name.slice(slash + 1), undefined, undefined, undefined).toString()
}
export const npmNameFromPurl = (value: string): string => {
  const purl = PackageURL.fromString(value)
  if (purl.type !== 'npm' || purl.version || purl.qualifiers || purl.subpath) throw new Error('INVALID_NPM_PURL')
  const name = purl.namespace ? `${purl.namespace}/${purl.name}` : purl.name
  if (npmPurl(name) !== value) throw new Error('NON_CANONICAL_NPM_PURL')
  return name
}

/** ponytail: disjoint canonical intervals only; add interval union when overlapping npm OR ranges are needed. */
export const npmRangeToVers = (value: string): Resolution<string> => {
  try {
    if (value.length > 512) return unresolved('RANGE_LIMIT')
    const range = new semver.Range(value)
    const intervals = range.set.map(set => {
      if (!semver.minVersion(set.map(c => c.value).join(' '))) throw new Error('EMPTY_RANGE')
      const exact = set.find(c => !c.operator && c.value)
      if (exact) {
        if (!semver.satisfies(exact.semver, set.map(c => c.value).join(' '))) throw new Error('EMPTY_RANGE')
        return [exact.semver.version]
      }
      const lower = set.filter(c => c.operator === '>' || c.operator === '>=').sort((a,b) => semver.compare(b.semver, a.semver) || (a.operator === '>' ? -1 : 1))[0]
      const upper = set.filter(c => c.operator === '<' || c.operator === '<=').sort((a,b) => semver.compare(a.semver, b.semver) || (a.operator === '<' ? -1 : 1))[0]
      return [lower?.value, upper?.value].filter((c): c is string => !!c)
    })
    if (intervals.some(interval => !interval.length)) return resolved('vers:npm/*')
    const result = `vers:npm/${intervals.flat().sort((a,b) => semver.compare(a.replace(/^[<>=]+/, ''), b.replace(/^[<>=]+/, ''))).join('|')}`
    const checked = versToNpmRange(result)
    return checked.status === 'resolved' && result.length <= 512 ? resolved(result) : unresolved('UNSUPPORTED_OVERLAPPING_OR_EMPTY_RANGE')
  } catch { return unresolved('INVALID_NPM_RANGE') }
}

export const versToNpmRange = (value: string): Resolution<string> => {
  if (value === 'vers:npm/*') return resolved('*')
  if (!value.startsWith('vers:npm/') || value.length > 512) return unresolved('INVALID_NPM_VERS')
  const tokens = value.slice(9).split('|')
  const clauses: string[] = []
  let lower: string | undefined, previous: string | undefined
  for (const token of tokens) {
    const match = /^(>=|>|<=|<|!=|=)?(.+)$/.exec(token)
    const version = match?.[2]
    if (!version || semver.valid(version) !== version || previous && semver.compare(previous, version) >= 0) return unresolved('NON_CANONICAL_NPM_VERS')
    previous = version
    const op = match![1] ?? '='
    if (op === '!=') return unresolved('UNSUPPORTED_EXCLUSION')
    if (op === '>' || op === '>=') {
      if (lower) return unresolved('INVALID_INTERVAL')
      lower = token
    } else if (op === '<' || op === '<=') {
      clauses.push([lower, token].filter(Boolean).join(' ')); lower = undefined
    } else {
      if (lower) return unresolved('INVALID_INTERVAL')
      clauses.push(version)
    }
  }
  if (lower) clauses.push(lower)
  // Ensure intervals alternate: adjacent upper bounds are not a canonical VERS.
  const signs = tokens.filter(t => /^[<>]/.test(t)).map(t => t[0])
  if (signs.some((sign,i) => i > 0 && sign === signs[i - 1])) return unresolved('INVALID_INTERVAL')
  return clauses.length ? resolved(clauses.join(' || ')) : unresolved('EMPTY_RANGE')
}

export const mapNpmRelease = (event: ReleaseEvent, packages: readonly Pick<PackageFact, 'purl'>[]): Resolution<readonly { purl: string; version: string }[]> => {
  const match = /^(?:(.+)@|v)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(event.tag)
  if (!match || !semver.valid(match[2])) return { ...unresolved('UNMATCHED_RELEASE'), evidence: event.evidence }
  const matches = packages.filter(pkg => {
    try { const name = npmNameFromPurl(pkg.purl); return !match[1] || name === match[1] } catch { return false }
  })
  if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'unresolved', reason: matches.length ? 'AMBIGUOUS_RELEASE' : 'UNMATCHED_RELEASE', evidence: event.evidence }
  return { status: 'resolved', value: [{ purl: matches[0]!.purl, version: match[2]! }], evidence: event.evidence }
}
export const npmVersionHooks: Pick<DiscoveryPluginV2, 'normalizeRange' | 'normalizeVersion' | 'compareVersions' | 'satisfiesRange' | 'mapRelease'> = {
  normalizeRange(purl, value) {
    try { npmNameFromPurl(purl); if (value.startsWith('workspace:')) return /^(?:\*|\^|~)$/.test(value.slice(10)) || semver.validRange(value.slice(10)) ? resolved(value) : unresolved('INVALID_WORKSPACE_RANGE'); if (value.startsWith('vers:')) { const parsed = versToNpmRange(value); return parsed.status === 'resolved' ? resolved(value) : parsed } return npmRangeToVers(value) } catch { return unresolved('INVALID_NPM_PURL') }
  },
  normalizeVersion(purl, value) { try { npmNameFromPurl(purl); return semver.valid(value) ? resolved(semver.valid(value)!) : unresolved('INVALID_VERSION') } catch { return unresolved('INVALID_NPM_PURL') } },
  compareVersions(purl, left, right) { try { npmNameFromPurl(purl); const result = semver.compare(left, right); return resolved(result < 0 ? -1 : result > 0 ? 1 : 0) } catch { return unresolved('INVALID_VERSION') } },
  satisfiesRange(purl, version, range) {
    try { npmNameFromPurl(purl); if (!semver.valid(version)) return unresolved('INVALID_VERSION'); const native = versToNpmRange(range); return native.status === 'resolved' ? resolved(semver.satisfies(version, native.value)) : native } catch { return unresolved('INVALID_NPM_PURL') }
  },
  async mapRelease({ event, packages }) { return mapNpmRelease(event, packages) },
}
