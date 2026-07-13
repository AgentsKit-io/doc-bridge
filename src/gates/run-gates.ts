import { readFileSync } from 'node:fs'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import {
  runDocumentationStandardV1,
  type DocumentationConformanceReportV1,
} from '../conformance/documentation-standard-v1.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { scanAgentCorpus } from '../index-builder/scan-corpus.js'
import { scanHumanDocRecords } from '../index-builder/human-adapters/index.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'

export type GateId =
  | 'index-freshness'
  | 'human-guide-links'
  | 'okf-type'
  | 'docs-style'
  | 'documentation-standard-v1'

const SUPPORTED_GATES = [
  'index-freshness',
  'human-guide-links',
  'okf-type',
  'docs-style',
  'documentation-standard-v1',
] as const

export type GateResult = {
  readonly id: GateId
  readonly ok: boolean
  readonly message: string
  readonly expected?: string
  readonly actual?: string
  readonly details?: DocumentationConformanceReportV1
}

export type GateRunResult = {
  readonly ok: boolean
  readonly results: GateResult[]
}

export const runGate = (
  root: string,
  config: DocBridgeConfigV1,
  id: GateId,
): GateResult => {
  if (id === 'documentation-standard-v1') {
    const details = runDocumentationStandardV1(root, config)
    return {
      id,
      ok: details.ok,
      message: details.ok
        ? 'Documentation Standard v1 required rules pass'
        : `${details.summary.required.failed} Documentation Standard v1 required rule(s) failed`,
      expected: 'all required rules pass or have approved exceptions',
      actual: `${details.summary.required.passed} passed, ${details.summary.required.failed} failed, ${details.summary.required.excepted} excepted`,
      details,
    }
  }
  if (id === 'human-guide-links') return runHumanGuideLinksGate(root, config)
  if (id === 'okf-type') return runOkfTypeGate(root, config)
  if (id === 'docs-style') return runDocsStyleGate(root, config)
  if (id !== 'index-freshness') throw new Error(`Unsupported gate "${id}"`)

  let current: string
  try {
    current = loadDocBridgeIndex(root, config).contentHash
  } catch (error) {
    if (error instanceof IndexNotFoundError) {
      return { id, ok: false, message: error.message }
    }
    throw error
  }

  const next = buildDocBridgeIndex({ root, config, write: false }).index.contentHash
  if (current !== next) {
    return {
      id,
      ok: false,
      message: 'Index is stale. Run: ak-docs index',
      expected: next,
      actual: current,
    }
  }

  return { id, ok: true, message: 'Index is fresh', expected: next, actual: current }
}

const runHumanGuideLinksGate = (root: string, config: DocBridgeConfigV1): GateResult => {
  const urls = new Set(scanHumanDocRecords(root, config).map((doc) => doc.url))
  const index = buildDocBridgeIndex({ root, config, write: false }).index
  const localHumanDocs = Object.values(index.handoffs ?? {})
    .map((handoff) => handoff.humanDoc)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .filter((url) => !/^https?:\/\//.test(url))
  const missing = localHumanDocs.filter((url, i, all) => !urls.has(url) && all.indexOf(url) === i)

  if (missing.length) {
    return {
      id: 'human-guide-links',
      ok: false,
      message: `Broken humanDoc links: ${missing.join(', ')}`,
      expected: 'all local humanDoc links resolve',
      actual: `${missing.length} broken`,
    }
  }

  return {
    id: 'human-guide-links',
    ok: true,
    message: `Resolved ${localHumanDocs.length} humanDoc link(s)`,
  }
}

const frontmatterType = (markdown: string): string | undefined => {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  return match?.[1]?.match(/^type:\s*['"]?([^'"\n#]+)['"]?/m)?.[1]?.trim()
}

const frontmatterField = (markdown: string, field: string): string | undefined => {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  return match?.[1]?.match(new RegExp(`^${field}:\\s*['"]?([^'\"\\n#]+)['"]?`, 'm'))?.[1]?.trim()
}

const runOkfTypeGate = (root: string, config: DocBridgeConfigV1): GateResult => {
  const required = config.corpus.agent.okf?.requireType ?? config.gates?.preset === 'strict'
  if (!required) return { id: 'okf-type', ok: true, message: 'OKF type frontmatter not required' }

  const allowed = config.corpus.agent.okf?.allowedTypes
  const bad = scanAgentCorpus(root, config)
    .filter((doc) => doc.path !== config.corpus.agent.index)
    .map((doc) => ({ path: doc.path, type: frontmatterType(readFileSync(doc.absPath, 'utf8')) }))
    .filter((doc) => !doc.type || (allowed && !allowed.includes(doc.type)))

  if (bad.length) {
    return {
      id: 'okf-type',
      ok: false,
      message: `Missing or invalid OKF type frontmatter: ${bad.map((doc) => doc.path).join(', ')}`,
      expected: allowed?.length ? `type: ${allowed.join(' | ')}` : 'type frontmatter',
      actual: `${bad.length} invalid`,
    }
  }

  return { id: 'okf-type', ok: true, message: 'All agent docs have OKF type frontmatter' }
}

type DocsStyleRule =
  | 'title'
  | 'purpose'
  | 'audience'
  | 'task-orientation'
  | 'examples'
  | 'owner-source'
  | 'no-stale-wording'

type DocsStyleProfile =
  | 'google-dev-docs'
  | 'playbook-okf'
  | 'playbook-okf-soft'
  | 'title-only'
  | 'custom'

const DOCS_STYLE_RULES: Record<Exclude<DocsStyleProfile, 'custom'>, DocsStyleRule[]> = {
  'google-dev-docs': [
    'title',
    'purpose',
    'audience',
    'task-orientation',
    'examples',
    'no-stale-wording',
  ],
  /** Full playbook OKF style (strict). */
  'playbook-okf': ['title', 'purpose', 'owner-source', 'no-stale-wording'],
  /** Soft profile for large existing OKF corpora (title + no stale placeholders). */
  'playbook-okf-soft': ['title', 'no-stale-wording'],
  'title-only': ['title'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const docsStyleOptions = (
  config: DocBridgeConfigV1,
): { profile: DocsStyleProfile; required: DocsStyleRule[] } => {
  const raw = config.gates?.options?.['docs-style']
  if (!isRecord(raw)) {
    if (config.gates?.preset === 'playbook') {
      return { profile: 'playbook-okf-soft', required: DOCS_STYLE_RULES['playbook-okf-soft'] }
    }
    return { profile: 'playbook-okf', required: DOCS_STYLE_RULES['playbook-okf'] }
  }

  const profile =
    raw.profile === 'google-dev-docs' ||
    raw.profile === 'playbook-okf' ||
    raw.profile === 'playbook-okf-soft' ||
    raw.profile === 'title-only' ||
    raw.profile === 'custom'
      ? raw.profile
      : 'playbook-okf'
  const customRequired = Array.isArray(raw.required)
    ? raw.required.filter((rule): rule is DocsStyleRule =>
        [
          'title',
          'purpose',
          'audience',
          'task-orientation',
          'examples',
          'owner-source',
          'no-stale-wording',
        ].includes(String(rule)),
      )
    : []

  return {
    profile,
    required: profile === 'custom' ? customRequired : DOCS_STYLE_RULES[profile],
  }
}

const missingStyleRules = (markdown: string, rules: readonly DocsStyleRule[]): DocsStyleRule[] => {
  const checks: Record<DocsStyleRule, boolean> = {
    title: /^#\s+\S+/m.test(markdown),
    purpose: Boolean(frontmatterField(markdown, 'purpose') || /^##\s+(Purpose|Goal)\b/im.test(markdown)),
    audience: Boolean(frontmatterField(markdown, 'audience') || /^##\s+Audience\b/im.test(markdown)),
    'task-orientation': /^##\s+(How to|Usage|Workflow|Tasks?)\b/im.test(markdown),
    examples: /^##\s+Examples?\b/im.test(markdown) || /```[\s\S]*?```/.test(markdown),
    'owner-source': Boolean(
      frontmatterField(markdown, 'owner') ||
        frontmatterField(markdown, 'source') ||
        /^(Owner|Source):\s+\S+/im.test(markdown),
    ),
    'no-stale-wording': !/\b(TODO|TBD|coming soon|eventually|placeholder)\b/i.test(markdown),
  }

  return rules.filter((rule) => !checks[rule])
}

const runDocsStyleGate = (root: string, config: DocBridgeConfigV1): GateResult => {
  const { profile, required } = docsStyleOptions(config)
  if (!required.length) {
    return { id: 'docs-style', ok: true, message: 'No docs-style rules configured' }
  }

  const bad = scanAgentCorpus(root, config)
    .filter((doc) => doc.path !== config.corpus.agent.index)
    .map((doc) => ({
      path: doc.path,
      missing: missingStyleRules(readFileSync(doc.absPath, 'utf8'), required),
    }))
    .filter((doc) => doc.missing.length > 0)

  if (bad.length) {
    return {
      id: 'docs-style',
      ok: false,
      message: `Docs style issues: ${bad
        .map((doc) => `${doc.path} (${doc.missing.join(', ')})`)
        .join('; ')}`,
      expected: `${profile}: ${required.join(', ')}`,
      actual: `${bad.length} file(s) with style issues`,
    }
  }

  return {
    id: 'docs-style',
    ok: true,
    message: `All agent docs pass ${profile} docs-style rules`,
  }
}

export const runGates = (
  root: string,
  config: DocBridgeConfigV1,
  ids?: readonly GateId[],
): GateRunResult => {
  const results = (ids ?? resolveGateIds(config)).map((id) => runGate(root, config, id))
  return { ok: results.every((result) => result.ok), results }
}

export const resolveGateIds = (config: DocBridgeConfigV1): GateId[] => {
  const preset = config.gates?.preset ?? 'minimal'
  const ids = new Set<GateId>(
    preset === 'minimal'
      ? ['index-freshness']
      : preset === 'strict'
        ? ['index-freshness', 'human-guide-links', 'okf-type', 'docs-style']
        : preset === 'playbook'
          ? // okf-type only — docs-style soft is opt-in via include (large corpora vary)
            ['index-freshness', 'okf-type']
          : ['index-freshness', 'human-guide-links'],
  )

  for (const id of config.gates?.include ?? []) {
    if (SUPPORTED_GATES.includes(id as GateId)) ids.add(id as GateId)
  }
  for (const id of config.gates?.exclude ?? []) {
    if (SUPPORTED_GATES.includes(id as GateId)) ids.delete(id as GateId)
  }

  return [...ids]
}
