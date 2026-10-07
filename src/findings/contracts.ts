import { classifyDocument } from './classification.js'
import { declaredAudience, parseMarkdownDocument } from '../discovery/markdown.js'
import { entityId } from '../discovery/identity.js'
import { changeSetEligibility, type DocumentTarget, type VersionComparator } from '../diff/version-routing.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { FindingV1Schema, type FindingV1 } from '../schemas/findings.js'
import type { ChangeSetV1 } from '../schemas/change-set.js'
import type { KnowledgeDiagnostic } from '../schemas/knowledge.js'

/** Same category/assertion/target projection rule as change-set findings; never revisions or time. */
export const findingIdentity = (category: string, assertion: FindingV1['assertion'], relevantEvidence: unknown): string =>
  entityId('finding', sha256NormalizedV1({ category, assertion, relevantEvidence }))
export const createFinding = (input: Omit<FindingV1, 'id' | 'evidenceHash' | 'type' | 'schemaVersion'>, relevantEvidence: unknown): FindingV1 =>
  FindingV1Schema.parse({ ...input, type: 'finding', schemaVersion: 1, id: findingIdentity(input.category, input.assertion, relevantEvidence), evidenceHash: sha256NormalizedV1(relevantEvidence) })
export const findingFromChangeDiagnostic = (diagnostic: KnowledgeDiagnostic, assertion: FindingV1['assertion'], provenance: FindingV1['provenance'], relevantEvidence: unknown): FindingV1 =>
  createFinding({ category: diagnostic.code === 'BROKEN_REFERENCE' ? 'broken-reference' : diagnostic.code === 'AMBIGUOUS_REFERENCE' ? 'ambiguous-reference' : diagnostic.code.toLowerCase().replaceAll('_', '-'), assertion, status: diagnostic.status, layer: 'L0', confidence: diagnostic.status === 'conflict' ? 1 : 0.5, severity: diagnostic.severity, entities: diagnostic.entityIds ?? [], evidence: diagnostic.evidence, routing: 'proposed', coverage: [], provenance }, relevantEvidence)
export type FindingRoutingOptions = {
  content: string; migrationSuspicious?: boolean; generator?: string
  classification?: { lifecycle: string; audience: string }
  changeSet?: ChangeSetV1; target?: DocumentTarget; adapter?: VersionComparator
}
/** Deterministic evidence exists before classification and policy disposition. */
export const routeFinding = (input: unknown, options: FindingRoutingOptions): FindingV1 => {
  const finding = FindingV1Schema.parse(input)
  const document = parseMarkdownDocument(finding.assertion.document, options.content)
  const classification = classifyDocument(document.path, { ...options.classification, ...document.frontmatter })
  const lifecycle = classification.lifecycle
  const audience = declaredAudience(document.frontmatter) ?? options.classification?.audience ?? classification.discoveryAudience
  let routing: FindingV1['routing'] = 'proposed', reason = 'Eligible for review'
  if (lifecycle === 'archived' || lifecycle === 'historical' || audience === 'archive') { routing = 'excluded'; reason = 'Historical/archived documentation remains visible without patches' }
  else if (options.migrationSuspicious) { routing = 'routed-to-L2'; reason = 'Suspicious migration context needs interpretation' }
  else if (options.changeSet && options.target) {
    const eligibility = changeSetEligibility(options.changeSet, options.target, options.adapter)
    if (eligibility.status !== 'resolved' || !eligibility.value) { routing = 'pending-version'; reason = eligibility.status === 'resolved' ? 'Target outside eligible release range' : eligibility.reason }
  }
  const generated = finding.evidence.some(evidence => evidence.path === document.path && evidence.lineStart !== undefined && document.generatedRegions.some(region => evidence.lineStart! <= region.lineEnd && (evidence.lineEnd ?? evidence.lineStart!) >= region.lineStart))
  if (generated || options.generator) { routing = 'excluded'; reason = 'Generated region: correct the generator' }
  return FindingV1Schema.parse({ ...finding, routing, ...(generated || options.generator ? { generator: options.generator ?? 'ak-docs render' } : {}), coverage: [...finding.coverage, { analyzer: 'finding-policy', scope: document.path, status: 'complete', reason }] })
}
