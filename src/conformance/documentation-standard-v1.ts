import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type {
  DocBridgeConfigV1,
  DocumentationStandardRuleId,
  DocumentationStandardV1Config,
} from '../config/schema.js'
import { parseCanonicalEcosystemContract } from './ecosystem-contract.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { scanHumanDocRecords } from '../index-builder/human-adapters/index.js'
import { renderLlmsTxt } from '../index-builder/llms-txt.js'
import { toPosix } from '../lib/paths.js'

export const DOCUMENTATION_STANDARD_V1_ID = 'documentation-standard-v1' as const
export const DOCUMENTATION_STANDARD_V1_STATUS = 'stable' as const

const MAX_TEXT_EVIDENCE_BYTES = 4 * 1_024 * 1_024

export type { DocumentationStandardRuleId } from '../config/schema.js'

export type DocumentationStandardRuleLevel = 'required' | 'recommended'
export type DocumentationStandardRuleStatus = 'pass' | 'fail' | 'excepted'

export type DocumentationStandardEvidence = {
  readonly path: string
  readonly detail: string
}

export type DocumentationStandardRemediation = {
  readonly command: string
  readonly detail: string
}

export type DocumentationStandardRuleResult = {
  readonly id: DocumentationStandardRuleId
  readonly level: DocumentationStandardRuleLevel
  readonly status: DocumentationStandardRuleStatus
  readonly ok: boolean
  readonly message: string
  readonly evidence: readonly DocumentationStandardEvidence[]
  readonly remediation: DocumentationStandardRemediation
  readonly exception?: {
    readonly reason: string
    readonly approvedBy: string
    readonly trackingUrl: string
  }
}

export type DocumentationConformanceReportV1 = {
  readonly schemaVersion: 1
  readonly profile: {
    readonly id: typeof DOCUMENTATION_STANDARD_V1_ID
    readonly version: 1
    readonly status: typeof DOCUMENTATION_STANDARD_V1_STATUS
  }
  readonly ok: boolean
  readonly recommendedOk: boolean
  readonly summary: {
    readonly required: { readonly passed: number; readonly failed: number; readonly excepted: number }
    readonly recommended: { readonly passed: number; readonly failed: number; readonly excepted: number }
  }
  readonly results: readonly DocumentationStandardRuleResult[]
}

type RuleDraft = Omit<DocumentationStandardRuleResult, 'status' | 'ok' | 'exception'> & {
  readonly passed: boolean
}

const safePath = (root: string, path: string): string | undefined => {
  const rootAbs = realpathSync.native(resolve(root))
  const unresolved = resolve(rootAbs, path)
  const unresolvedRel = relative(rootAbs, unresolved)
  if (isAbsolute(unresolvedRel) || unresolvedRel === '..' || unresolvedRel.startsWith(`..${sep}`)) return undefined
  if (!existsSync(unresolved)) return unresolved
  try {
    const abs = realpathSync.native(unresolved)
    const rel = relative(rootAbs, abs)
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) ? abs : undefined
  } catch {
    return undefined
  }
}

const fileEvidence = (
  root: string,
  path: string,
  options?: { readonly readContent?: boolean },
): { readonly exists: boolean; readonly content: string; readonly evidence: DocumentationStandardEvidence } => {
  const abs = safePath(root, path)
  if (!abs) {
    return {
      exists: false,
      content: '',
      evidence: { path, detail: 'Path escapes the project root.' },
    }
  }
  if (!existsSync(abs)) {
    return { exists: false, content: '', evidence: { path, detail: 'File does not exist.' } }
  }
  try {
    const stat = statSync(abs)
    if (!stat.isFile()) {
      return { exists: false, content: '', evidence: { path, detail: 'Path is not a regular file.' } }
    }
    if (stat.size === 0) {
      return { exists: false, content: '', evidence: { path, detail: 'File is empty.' } }
    }
    if (options?.readContent === false) {
      return {
        exists: true,
        content: '',
        evidence: { path: toPosix(relative(resolve(root), abs)) || '.', detail: 'File exists and is non-empty.' },
      }
    }
    if (stat.size > MAX_TEXT_EVIDENCE_BYTES) {
      return {
        exists: false,
        content: '',
        evidence: { path, detail: `Text evidence exceeds ${MAX_TEXT_EVIDENCE_BYTES} bytes.` },
      }
    }
    const content = readFileSync(abs, 'utf8')
    return {
      exists: content.trim().length > 0,
      content,
      evidence: {
        path: toPosix(relative(resolve(root), abs)) || '.',
        detail: content.trim().length > 0 ? 'File exists and is non-empty.' : 'File is empty.',
      },
    }
  } catch {
    return { exists: false, content: '', evidence: { path, detail: 'File is not readable text.' } }
  }
}

const resultWithException = (
  draft: RuleDraft,
  options: DocumentationStandardV1Config,
): DocumentationStandardRuleResult => {
  if (draft.passed) {
    const { passed: _passed, ...result } = draft
    return { ...result, status: 'pass', ok: true }
  }

  const exception = options.exceptions?.find((candidate) => candidate.ruleId === draft.id)
  const { passed: _passed, ...result } = draft
  if (!exception) return { ...result, status: 'fail', ok: false }
  return {
    ...result,
    status: 'excepted',
    ok: true,
    exception: {
      reason: exception.reason,
      approvedBy: exception.approvedBy,
      trackingUrl: exception.trackingUrl,
    },
  }
}

const humanDocsRule = (root: string, config: DocBridgeConfigV1): RuleDraft => {
  const docs = scanHumanDocRecords(root, config)
  return {
    id: 'human-docs',
    level: 'required',
    passed: docs.length > 0,
    message: docs.length > 0 ? `Found ${docs.length} human document(s).` : 'No human documentation was discovered.',
    evidence: docs.slice(0, 10).map((doc) => ({
      path: toPosix(relative(resolve(root), doc.path)),
      detail: `Human route: ${doc.url}`,
    })),
    remediation: {
      command: 'edit doc-bridge.config.json',
      detail: 'Configure corpus.human with a supported adapter and a non-agent documentation root.',
    },
  }
}

const llmsRule = (
  root: string,
  config: DocBridgeConfigV1,
  options: DocumentationStandardV1Config,
): RuleDraft => {
  const llmsPath = config.index?.llmsTxt?.outFile ?? 'llms.txt'
  const llmsKey = safePath(root, llmsPath) ?? resolve(root, llmsPath)
  const rawSources = new Map<string, string>()
  for (const path of options.rawSources ?? []) {
    const key = safePath(root, path) ?? resolve(root, path)
    if (key !== llmsKey && !rawSources.has(key)) rawSources.set(key, path)
  }
  const paths = [llmsPath, ...rawSources.values()]
  const evidence = paths.map((path) => fileEvidence(root, path))
  const generated = buildDocBridgeIndex({ root, config, write: false }).index
  const expectedLlms = renderLlmsTxt(config, generated.knowledge, generated.project?.name ?? 'project')
  const llmsIsFresh = evidence[0]?.content === expectedLlms
  if (evidence[0]?.exists) {
    evidence[0] = {
      ...evidence[0],
      evidence: {
        ...evidence[0].evidence,
        detail: llmsIsFresh
          ? 'File matches the deterministic ak-docs output.'
          : 'File is stale or was not generated by the current ak-docs inputs.',
      },
    }
  }
  const passed =
    config.index?.llmsTxt?.enabled !== false &&
    paths.length > 1 &&
    llmsIsFresh &&
    evidence.every((item) => item.exists)
  return {
    id: 'llms-and-raw-source',
    level: 'required',
    passed,
    message: passed
      ? `Resolved llms.txt and ${paths.length - 1} raw source(s).`
      : 'llms.txt must be enabled, current, and accompanied by at least one readable raw source.',
    evidence: evidence.map((item) => item.evidence),
    remediation: {
      command: 'ak-docs index',
      detail: 'Generate llms.txt and configure conformance.documentationStandardV1.rawSources.',
    },
  }
}

const normalizedUrl = (value: string): string => value.replace(/\/$/, '')

const ecosystemContract = (
  root: string,
  options: DocumentationStandardV1Config,
): {
  readonly passed: boolean
  readonly urls: ReadonlySet<string>
  readonly evidence: readonly DocumentationStandardEvidence[]
} => {
  const declaration = options.ecosystemContract
  if (!declaration) {
    return {
      passed: false,
      urls: new Set(),
      evidence: [{ path: 'doc-bridge.config.json', detail: 'Canonical ecosystem contract evidence is not declared.' }],
    }
  }

  const manifestFile = fileEvidence(root, declaration.manifest)
  const claimsFile = fileEvidence(root, declaration.claims)
  const evidence: DocumentationStandardEvidence[] = [manifestFile.evidence, claimsFile.evidence]
  if (!manifestFile.exists || !claimsFile.exists) return { passed: false, urls: new Set(), evidence }

  try {
    const manifest: unknown = JSON.parse(manifestFile.content)
    const claims: unknown = JSON.parse(claimsFile.content)
    const contract = parseCanonicalEcosystemContract(manifest, claims)
    const productIds = contract.manifest.products.map((product) => product.id)
    if (!productIds.includes(declaration.productId)) throw new Error(`Manifest is missing product ${declaration.productId}.`)

    const urls = new Set<string>()
    for (const product of contract.manifest.products) {
      for (const value of [
        product.surfaces.home,
        product.surfaces.docs,
        product.surfaces.llms,
        product.surfaces.stats,
      ]) {
        if (typeof value === 'string' && /^https:\/\//.test(value)) urls.add(normalizedUrl(value))
      }
    }
    evidence[0] = { path: declaration.manifest, detail: `Validated ${productIds.length} canonical product(s), including ${declaration.productId}.` }
    evidence[1] = { path: declaration.claims, detail: `Validated claim-ledger identity for ${contract.claims.products.length} product(s).` }
    return { passed: urls.size > 0, urls, evidence }
  } catch (error) {
    evidence.push({
      path: `${declaration.manifest}, ${declaration.claims}`,
      detail: error instanceof Error ? error.message : 'Canonical ecosystem contract is invalid.',
    })
    return { passed: false, urls: new Set(), evidence }
  }
}

const handoffsRule = (root: string, config: DocBridgeConfigV1): RuleDraft => {
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  const handoffs = Object.values(index.handoffs ?? {})
  const ready = handoffs.filter(
    (handoff) =>
      handoff.startHere.length > 0 &&
      handoff.editRoots.length > 0 &&
      handoff.checks.length > 0 &&
      (handoff.bridge?.humanDoc === 'linked' || handoff.bridge?.humanDoc === 'external'),
  )
  return {
    id: 'agent-handoffs',
    level: 'required',
    passed: ready.length > 0 && ready.length === handoffs.length,
    message:
      ready.length > 0 && ready.length === handoffs.length
        ? `${ready.length} handoff(s) are action-ready and human-linked.`
        : `${ready.length}/${handoffs.length} handoff(s) are action-ready and human-linked.`,
    evidence: handoffs.map((handoff) => ({
      path: handoff.startHere,
      detail: `${handoff.target.id}: ${handoff.editRoots.length} edit root(s), ${handoff.checks.length} check(s), bridge=${handoff.bridge?.humanDoc ?? 'none'}`,
    })),
    remediation: {
      command: 'ak-docs bootstrap agent-docs && ak-docs index',
      detail: 'Add ownership checks and a resolvable humanDoc for every handoff.',
    },
  }
}

const contributionRule = (root: string, options: DocumentationStandardV1Config): RuleDraft => {
  const paths = options.contributionPaths?.length ? options.contributionPaths : ['CONTRIBUTING.md']
  const evidence = paths.map((path) => fileEvidence(root, path))
  return {
    id: 'contribution',
    level: 'required',
    passed: evidence.some((item) => item.exists),
    message: evidence.some((item) => item.exists) ? 'Contribution guidance is available.' : 'Contribution guidance is missing.',
    evidence: evidence.map((item) => item.evidence),
    remediation: {
      command: 'edit CONTRIBUTING.md',
      detail: 'Document setup, validation commands, and the pull-request workflow.',
    },
  }
}

const markersRule = (
  root: string,
  options: DocumentationStandardV1Config,
  kind: 'metadata' | 'structured-diagrams',
  level: DocumentationStandardRuleLevel,
): RuleDraft => {
  const declarations = options[kind === 'metadata' ? 'metadata' : 'diagrams'] ?? []
  const evidence: DocumentationStandardEvidence[] = []
  let passed = declarations.length > 0
  for (const declaration of declarations) {
    const file = fileEvidence(root, declaration.path)
    const missing = declaration.contains.filter((marker) => !file.content.includes(marker))
    if (!file.exists || missing.length > 0) passed = false
    evidence.push({
      path: declaration.path,
      detail: !file.exists
        ? file.evidence.detail
        : missing.length
          ? `Missing marker(s): ${missing.join(', ')}`
          : `Found marker(s): ${declaration.contains.join(', ')}`,
    })
  }
  return {
    id: kind,
    level,
    passed,
    message: passed ? `${kind} evidence is complete.` : `${kind} evidence is incomplete.`,
    evidence,
    remediation: {
      command: 'edit doc-bridge.config.json',
      detail: `Declare ${kind} evidence paths and markers that exist in the repository.`,
    },
  }
}

const linksRule = (root: string, options: DocumentationStandardV1Config): RuleDraft => {
  const links = options.links ?? []
  const contract = ecosystemContract(root, options)
  const evidence: DocumentationStandardEvidence[] = [...contract.evidence]
  let passed = links.length > 0 && contract.passed
  for (const link of links) {
    const sources = link.paths.map((path) => ({ path, file: fileEvidence(root, path) }))
    const matches = sources.filter(({ file }) => file.exists && file.content.includes(link.url))
    const canonical = contract.urls.has(normalizedUrl(link.url))
    if (matches.length === 0 || !canonical) passed = false
    evidence.push({
      path: sources.map((source) => source.path).join(', '),
      detail:
        matches.length === 0
          ? `Missing ${link.url}`
          : canonical
            ? `Found canonical ecosystem URL ${link.url}`
            : `Found ${link.url}, but it is absent from the canonical ecosystem manifest.`,
    })
  }
  return {
    id: 'cross-links',
    level: 'required',
    passed,
    message: passed ? `${links.length} required ecosystem link(s) resolve in source.` : 'One or more required ecosystem links are missing from source.',
    evidence,
    remediation: {
      command: 'edit README.md',
      detail: 'Sync the canonical ecosystem snapshots and add each configured canonical URL to a declared documentation source.',
    },
  }
}

const quickstartsRule = (root: string, options: DocumentationStandardV1Config): RuleDraft => {
  const quickstarts = options.quickstarts ?? []
  const evidence: DocumentationStandardEvidence[] = []
  let passed = quickstarts.length > 0
  for (const quickstart of quickstarts) {
    const doc = fileEvidence(root, quickstart.doc)
    const test = fileEvidence(root, quickstart.test)
    const missingMarkers = quickstart.testContains.filter((marker) => !test.content.includes(marker))
    if (!doc.exists || !test.exists || missingMarkers.length > 0 || !quickstart.command.trim()) passed = false
    evidence.push(
      { path: quickstart.doc, detail: `${quickstart.id}: ${doc.evidence.detail}` },
      {
        path: quickstart.test,
        detail: missingMarkers.length
          ? `${quickstart.id}: missing test marker(s): ${missingMarkers.join(', ')}`
          : `${quickstart.id}: test evidence; CI command: ${quickstart.command}`,
      },
    )
  }
  return {
    id: 'tested-quickstarts',
    level: 'required',
    passed,
    message: passed ? `${quickstarts.length} quickstart(s) have executable test evidence.` : 'Quickstart test evidence is incomplete.',
    evidence,
    remediation: {
      command: 'pnpm test',
      detail: 'Map every quickstart to a documentation path, test file, identifying marker, and CI command.',
    },
  }
}

const visualsRule = (root: string, options: DocumentationStandardV1Config): RuleDraft => {
  const visuals = options.visuals ?? []
  const evidence = visuals.map((path) => fileEvidence(root, path, { readContent: false }))
  return {
    id: 'visual-explanations',
    level: 'recommended',
    passed: visuals.length > 0 && evidence.every((item) => item.exists),
    message: visuals.length > 0 && evidence.every((item) => item.exists) ? `${visuals.length} visual asset(s) found.` : 'Visual explanation evidence is incomplete.',
    evidence: evidence.map((item) => item.evidence),
    remediation: {
      command: 'edit doc-bridge.config.json',
      detail: 'Declare the images or animations that explain the product workflow.',
    },
  }
}

const count = (
  results: readonly DocumentationStandardRuleResult[],
  level: DocumentationStandardRuleLevel,
  status: DocumentationStandardRuleStatus,
): number => results.filter((result) => result.level === level && result.status === status).length

export const runDocumentationStandardV1 = (
  root: string,
  config: DocBridgeConfigV1,
): DocumentationConformanceReportV1 => {
  const options = config.conformance?.documentationStandardV1 ?? {}
  const drafts: RuleDraft[] = [
    humanDocsRule(root, config),
    llmsRule(root, config, options),
    handoffsRule(root, config),
    contributionRule(root, options),
    markersRule(root, options, 'metadata', 'required'),
    linksRule(root, options),
    quickstartsRule(root, options),
    visualsRule(root, options),
    markersRule(root, options, 'structured-diagrams', 'recommended'),
  ]
  const results = drafts.map((draft) => resultWithException(draft, options))
  return {
    schemaVersion: 1,
    profile: { id: DOCUMENTATION_STANDARD_V1_ID, version: 1, status: DOCUMENTATION_STANDARD_V1_STATUS },
    ok: results.filter((result) => result.level === 'required').every((result) => result.ok),
    recommendedOk: results.filter((result) => result.level === 'recommended').every((result) => result.ok),
    summary: {
      required: {
        passed: count(results, 'required', 'pass'),
        failed: count(results, 'required', 'fail'),
        excepted: count(results, 'required', 'excepted'),
      },
      recommended: {
        passed: count(results, 'recommended', 'pass'),
        failed: count(results, 'recommended', 'fail'),
        excepted: count(results, 'recommended', 'excepted'),
      },
    },
    results,
  }
}

export const formatDocumentationStandardText = (
  report: DocumentationConformanceReportV1,
): string[] => [
  `Documentation Standard v1 (${report.profile.status})`,
  `Required: ${report.summary.required.passed} passed · ${report.summary.required.failed} failed · ${report.summary.required.excepted} excepted`,
  `Recommended: ${report.summary.recommended.passed} passed · ${report.summary.recommended.failed} failed · ${report.summary.recommended.excepted} excepted`,
  '',
  ...report.results.flatMap((result) => [
    `${result.status === 'pass' ? 'PASS' : result.status === 'excepted' ? 'EXCEPTED' : 'FAIL'} [${result.level}] ${result.id}: ${result.message}`,
    ...result.evidence.map((evidence) => `  evidence: ${evidence.path} — ${evidence.detail}`),
    ...(result.exception
      ? [`  exception: ${result.exception.reason} — ${result.exception.approvedBy} (${result.exception.trackingUrl})`]
      : result.ok
        ? []
        : [`  fix: ${result.remediation.command} — ${result.remediation.detail}`]),
  ]),
]
