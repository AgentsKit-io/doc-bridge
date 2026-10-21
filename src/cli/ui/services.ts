import { basename, resolve, sep } from 'node:path'

import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { runDoctor, type DoctorReport } from '../../doctor/run-doctor.js'
import { checkIndexReproducibility } from '../../discovery/reproducibility.js'
import { publicationDecision, runGate, type GateResult } from '../../gates/run-gates.js'
import { buildDocBridgeIndex } from '../../index-builder/build-index.js'
import { readBoundedText } from '../../lib/bounded-text.js'
import { loadFreshDocBridgeIndex } from '../../query/load-index.js'
import { buildAskResult, type AskResult } from './ask.js'
import type { IndexResult } from './render.js'

export type Freshness = 'fresh' | 'stale' | 'missing'

export type DocumentContext = {
  /** 1-based number of the first line in `lines`. */
  readonly start: number
  readonly lines: readonly string[]
  /** 1-based number of the cited line. */
  readonly focus: number
}

/** What the interactive UI calls. The real implementation is the library; tests substitute their own. */
export type UiServices = {
  readonly name: string
  readonly ask: (question: string) => AskResult
  readonly findings: () => GateResult
  readonly publicationGate: () => GateResult | undefined
  readonly publish: (options: { readonly allowPendingFindings: boolean }) => IndexResult
  readonly doctor: () => DoctorReport
  readonly freshness: () => Freshness
  readonly context: (document: string, line: number | undefined, radius?: number) => DocumentContext | undefined
}

const MAX_DOCUMENT_BYTES = 2_000_000

const diagnostics = (root: string, config: DocBridgeConfigV1, result: ReturnType<typeof buildDocBridgeIndex>): string[] => {
  const notes: string[] = []
  const only = result.index.knowledge.length === 1 ? result.index.knowledge[0] : undefined
  if (only?.path === config.corpus.agent.index) {
    notes.push(`Only the starter ${config.corpus.agent.index} was indexed.`, `Add agent docs under ${config.corpus.agent.root}/, then run ak-docs index again.`)
  }
  if (Object.keys(result.index.handoffs ?? {}).length === 0) {
    notes.push('No ownership handoffs yet. Add routing.options.ownership, package frontmatter (package + editRoot), or a monorepo plugin.')
  }
  const reproducibility = checkIndexReproducibility(root, config.index?.outFile ?? '.doc-bridge/index.json', result.index.knowledge.map((entry) => entry.path))
  if (reproducibility.ignored.length > 0) {
    notes.push(`${reproducibility.ignored.length} indexed path(s) are ignored by Git, so a clean checkout builds a different index.`)
  }
  return notes
}

const nextCommands = (config: DocBridgeConfigV1, result: ReturnType<typeof buildDocBridgeIndex>): string[] => {
  const first = Object.keys(result.index.handoffs ?? {})[0]
  return first
    ? [`ak-docs query package ${first} --agent`, 'ak-docs list packages --text', 'ak-docs mcp']
    : [`edit ${config.corpus.agent.root}/packages/<module>.md  # frontmatter: package + editRoot`, 'ak-docs index']
}

export const createServices = ({ root, config }: { readonly root: string; readonly config: DocBridgeConfigV1 }): UiServices => ({
  name: basename(resolve(root)),
  ask: (question) => buildAskResult(loadFreshDocBridgeIndex(root, config), config, question),
  findings: () => runGate(root, config, 'reference-findings'),
  publicationGate: () => {
    const decision = publicationDecision(root, config)
    return decision.gate
  },
  publish: ({ allowPendingFindings }) => {
    const decision = publicationDecision(root, config, { allowPendingFindings })
    if (!decision.allowed) return { ok: false, blockedBy: decision.gate.id, gate: decision.gate }
    const result = buildDocBridgeIndex({ root, config, ...(decision.publication ? { publication: decision.publication } : {}) })
    const notes = diagnostics(root, config, result)
    return {
      ok: true,
      ...(result.index.publication ? { publication: result.index.publication } : {}),
      indexPath: result.indexPath,
      ...(result.llmsTxtPath ? { llmsTxtPath: result.llmsTxtPath } : {}),
      ...(result.capabilitiesPath ? { capabilitiesPath: result.capabilitiesPath } : {}),
      contentHash: result.index.contentHash,
      knowledgeCount: result.index.knowledge.length,
      packageCount: result.index.lookup?.packages.length ?? 0,
      handoffCount: Object.keys(result.index.handoffs ?? {}).length,
      ...(notes.length ? { diagnostics: notes } : {}),
      nextCommands: nextCommands(config, result),
    }
  },
  doctor: () => runDoctor(root, config),
  freshness: () => {
    const gate = runGate(root, config, 'index-freshness')
    if (gate.ok) return 'fresh'
    return gate.message.startsWith('Index is stale') ? 'stale' : 'missing'
  },
  context: (document, line, radius = 3) => {
    const absolute = resolve(root, document)
    const base = resolve(root)
    // The path comes from a finding; it never reads outside the project.
    if (absolute !== base && !absolute.startsWith(`${base}${sep}`)) return undefined
    try {
      const lines = readBoundedText(absolute, { used: 0 }, { maxFileBytes: MAX_DOCUMENT_BYTES, maxCorpusBytes: MAX_DOCUMENT_BYTES }).split(/\r?\n/u)
      const focus = Math.min(Math.max(line ?? 1, 1), Math.max(lines.length, 1))
      const start = Math.max(1, focus - radius)
      return { start, lines: lines.slice(start - 1, focus + radius), focus }
    } catch {
      return undefined
    }
  },
})
