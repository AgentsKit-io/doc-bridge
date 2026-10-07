import { parse as parseYaml } from 'yaml'
import { DocumentTargetSchema, type DocumentTarget } from '../diff/version-routing.js'
import type { PackageFact } from '../storage/facts.js'
import type { Evidence } from '../schemas/knowledge.js'
import type { Resolution } from '../plugins/contract.js'

export type TargetAdapter = { normalizeRange(purl: string, range: string): Resolution<string> }
/** The core chooses provenance/precedence; ecosystem validation is caller supplied. */
export const resolveDocumentTargets = (block: string | undefined, evidence: Evidence, owner: PackageFact | undefined, adapter: TargetAdapter): DocumentTarget[] => {
  const unresolved = (reason: string, purl?: string): DocumentTarget => ({ state: 'unresolved', source: 'frontmatter', reason, ...(purl ? { purl } : {}), evidence: [evidence] })
  let data: any
  try { data = block === undefined ? undefined : parseYaml(block) } catch { return [unresolved('INVALID_FRONTMATTER')] }
  const declarations = data?.docbridge?.targets
  if (declarations === undefined) return [{ state: 'latest-released', source: 'implicit', evidence: [] }]
  if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) return [unresolved('INVALID_TARGETS')]
  const entries = Object.entries(declarations)
  if (entries.length > 32) return [unresolved('TARGET_LIMIT')]
  if (!entries.length) return [{ state: 'latest-released', source: 'implicit', evidence: [] }]
  return entries.sort(([a],[b]) => a.localeCompare(b)).map(([purl, declaration]) => {
    if (purl.length > 512 || !/^pkg:[a-z][a-z0-9.+-]*\/[^\s]+$/.test(purl)) return unresolved('INVALID_TARGET_PURL')
    if (declaration === 'default-branch') return adapter.normalizeRange(purl, '*').status === 'resolved' ? { state: 'default-branch', source: 'frontmatter', purl, evidence: [evidence] } : unresolved('INVALID_TARGET_PURL', purl)
    if ((typeof declaration !== 'string' && declaration !== null) || (typeof declaration === 'string' && (!declaration.trim() || declaration.length > 512))) return unresolved('INVALID_TARGET_DECLARATION', purl)
    let source: DocumentTarget['source'] = 'frontmatter', range = declaration as string | null, proofs = [evidence]
    if (declaration === null) {
      const dependency = owner?.dependencies.find(dep => dep.purl === purl)
      if (!dependency) return unresolved('UNRESOLVABLE_PACKAGE_TARGET', purl)
      source = dependency.lockedVersion === undefined ? 'manifest' : 'lockfile'
      range = dependency.lockedVersion ?? dependency.range
      proofs = [...(owner?.evidence ?? [])].slice(0, 4)
    }
    const normalized = adapter.normalizeRange(purl, range!)
    return DocumentTargetSchema.parse(normalized.status === 'resolved' ? { state: 'resolved', purl, range: normalized.value, source, evidence: proofs } : { state: 'unresolved', purl, source, reason: normalized.reason, evidence: proofs })
  })
}
