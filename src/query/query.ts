import type { DocBridgeConfigV1 } from '../config/schema.js'
import {
  normalizeAgentHandoff,
  AgentQueryModeSchema,
  type AgentHandoffV1,
  type AgentQueryMode,
  type AgentSearchV1,
} from '../schemas/agent-handoff.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { searchIndex } from './search.js'
import { Buffer } from 'node:buffer'

export type QueryKind = 'package' | 'ownership' | 'intent' | 'change' | 'search'

export type QueryRequest = {
  readonly kind: QueryKind
  readonly id?: string
  readonly term?: string
  readonly agent?: boolean
  readonly mode?: AgentQueryMode
  readonly contextBudgetTokens?: number
}

export type QueryResult =
  | { readonly type: 'package' | 'ownership' | 'intent' | 'change' | 'search'; readonly data: unknown }
  | AgentHandoffV1
  | AgentSearchV1

export const DEFAULT_AGENT_CONTEXT_BUDGET_TOKENS = 32

const handoffForPackage = (
  index: DocBridgeIndexV1,
  id: string,
  config: DocBridgeConfigV1,
): AgentHandoffV1 => {
  const fromIndex = index.handoffs?.[id]
  if (fromIndex) return normalizeAgentHandoff(fromIndex)

  const owner = index.lookup?.ownership?.[id]
  if (!owner) throw new Error(`Unknown package/ownership id "${id}". Try: ak-docs list packages`)

  const bridge = owner.humanDoc
    ? /^https?:\/\//.test(owner.humanDoc)
      ? { humanDoc: 'external' as const }
      : { humanDoc: 'linked' as const }
    : config.corpus.human
      ? {
          humanDoc: 'missing' as const,
          action: 'ak-docs bootstrap agent-docs',
          bootstrap: `docs/for-agents/human/${id}.md`,
        }
      : undefined

  return normalizeAgentHandoff({
    type: 'agent-handoff',
    source: config.index?.outFile ?? '.doc-bridge/index.json',
    target: {
      type: 'package',
      id,
      path: owner.path,
      ...(owner.group ? { group: owner.group } : {}),
      ...(owner.layer ? { layer: owner.layer } : {}),
    },
    startHere: owner.agentDoc ?? config.corpus.agent.index ?? '',
    readBeforeEditing: [owner.agentDoc, 'AGENTS.md'].filter(Boolean),
    editRoots: [owner.path],
    checks: [...owner.checks],
    ...(owner.humanDoc ? { humanDoc: owner.humanDoc } : {}),
    ...(bridge ? { bridge } : {}),
    notes: [
      ...(owner.purpose ? [owner.purpose] : []),
      ...(!owner.humanDoc && config.corpus.human
        ? [`Human guide missing for ${id}. Run: ak-docs bootstrap agent-docs`]
        : []),
    ],
  })
}

const modeLimits: Record<AgentQueryMode, { readonly matches: number; readonly nextCommands: number }> = {
  discovery: { matches: 8, nextCommands: 5 },
  editing: { matches: 5, nextCommands: 3 },
  debugging: { matches: 6, nextCommands: 4 },
  documentation: { matches: 6, nextCommands: 3 },
}

const boundedAgentContext = (
  matches: readonly AgentSearchV1['matches'][number][],
  nextCommands: readonly string[],
  contextBudgetTokens: number,
): { readonly matches: AgentSearchV1['matches']; readonly nextCommands: string[]; readonly contextBytes: number; readonly truncated: boolean } => {
  if (!Number.isInteger(contextBudgetTokens) || contextBudgetTokens < 1 || contextBudgetTokens > 1_000_000) throw new Error('contextBudgetTokens must be an integer between 1 and 1000000.')
  const maxBytes = contextBudgetTokens * 4
  let boundedMatches = matches.map((match) => ({ ...match }))
  let boundedCommands = [...nextCommands]
  let truncated = false
  const contextBytes = () => Buffer.byteLength(JSON.stringify({ matches: boundedMatches, nextCommands: boundedCommands }), 'utf8')
  while (contextBytes() > maxBytes) {
    const summaryIndex = [...boundedMatches].map((match) => match.summary !== undefined).lastIndexOf(true)
    if (summaryIndex >= 0) {
      const match = boundedMatches[summaryIndex]
      if (match) {
        const { summary: _summary, ...withoutSummary } = match
        boundedMatches[summaryIndex] = withoutSummary
        truncated = true
        continue
      }
    }
    if (boundedCommands.length > 1) {
      boundedCommands.pop()
      truncated = true
      continue
    }
    if (boundedMatches.length > 1) {
      boundedMatches.pop()
      truncated = true
      continue
    }
    if (boundedCommands.length > 0) {
      boundedCommands.pop()
      truncated = true
      continue
    }
    break
  }
  const finalContextBytes = contextBytes()
  if (finalContextBytes > maxBytes) throw new Error(`contextBudgetTokens ${contextBudgetTokens} is too small for the minimum grounded result.`)
  return { matches: boundedMatches, nextCommands: boundedCommands, contextBytes: finalContextBytes, truncated }
}

export const runQuery = (
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
  req: QueryRequest,
): QueryResult => {
  if (req.kind === 'search') {
    const term = req.term ?? req.id ?? ''
    const matches = searchIndex(index, term)
    if (req.agent) {
      const mode = AgentQueryModeSchema.parse(req.mode ?? 'discovery')
      const limits = modeLimits[mode]
      const focusedMatches = matches[0] && (matches[0].type === 'intent' || matches[0].type === 'change')
        ? matches.filter((match) => match.type === matches[0]?.type).slice(0, 3)
        : matches.slice(0, limits.matches)
      const agentMatches = focusedMatches.map((m) => ({
        type: m.type,
        id: m.id,
        path: m.path,
        ...(m.summary ? { summary: m.summary } : {}),
      }))
      const nextCommands = [...new Set(focusedMatches.slice(0, limits.nextCommands).map((m) =>
        m.type === 'intent'
          ? `ak-docs query intent ${m.id} --agent`
          : m.type === 'change'
            ? `ak-docs query change ${m.id} --agent`
            : m.type === 'ownership' || index.lookup?.ownership?.[m.id]
          ? `ak-docs query ownership ${m.id} --agent`
          : 'ak-docs list knowledge --text',
      ))]
      const budget = req.contextBudgetTokens ?? DEFAULT_AGENT_CONTEXT_BUDGET_TOKENS
      const bounded = boundedAgentContext(agentMatches, nextCommands, budget)
      const payload: AgentSearchV1 = {
        type: 'agent-search',
        schemaVersion: 1,
        source: config.index?.outFile ?? '.doc-bridge/index.json',
        term,
        count: matches.length,
        bestMatch: matches[0]
          ? {
              type: matches[0].type,
              id: matches[0].id,
              path: matches[0].path,
              ...(matches[0].summary ? { summary: matches[0].summary } : {}),
            }
          : null,
        matches: bounded.matches,
        nextCommands: bounded.nextCommands,
        telemetry: {
          contextBytes: bounded.contextBytes,
          estimatedTokens: Math.ceil(bounded.contextBytes / 4),
          tokenMethod: 'estimate',
          contextBudgetTokens: budget,
          mode,
          truncated: bounded.truncated,
        },
      }
      return payload
    }
    return { type: 'search', data: { term, count: matches.length, matches } }
  }

  const id = req.id
  if (!id) throw new Error(`Missing id for query kind "${req.kind}"`)

  if (req.kind === 'package' || req.kind === 'ownership') {
    if (req.agent) return handoffForPackage(index, id, config)
    const owner = index.lookup?.ownership?.[id]
    return { type: req.kind, data: owner ?? index.handoffs?.[id] ?? null }
  }

  if (req.kind === 'intent') {
    const intent = index.lookup?.intents?.[id]
    if (!intent) throw new Error(`Unknown intent "${id}"`)
    if (req.agent) {
      return normalizeAgentHandoff({
        type: 'agent-handoff',
        source: config.index?.outFile ?? '.doc-bridge/index.json',
        target: { type: 'intent', id },
        startHere: intent.paths[0] ?? '',
        readBeforeEditing: [...intent.paths],
        editRoots: [],
        checks: [],
        notes: [intent.title],
      })
    }
    return { type: 'intent', data: intent }
  }

  if (req.kind === 'change') {
    const change = index.lookup?.changes?.[id]
    if (!change) throw new Error(`Unknown change route "${id}"`)
    if (req.agent) {
      return normalizeAgentHandoff({
        type: 'agent-handoff',
        source: config.index?.outFile ?? '.doc-bridge/index.json',
        target: { type: 'change', id },
        startHere: change.startHere,
        readBeforeEditing: ['AGENTS.md', config.corpus.agent.index ?? ''].filter(Boolean),
        editRoots: [change.startHere],
        checks: [],
        notes: [change.title],
      })
    }
    return { type: 'change', data: change }
  }

  throw new Error(`Unsupported query kind: ${req.kind as string}`)
}
