import type { DocBridgeConfigV1 } from '../config/schema.js'
import {
  normalizeAgentHandoff,
  type AgentHandoffV1,
  type AgentSearchV1,
} from '../schemas/agent-handoff.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { searchIndex } from './search.js'

export type QueryKind = 'package' | 'ownership' | 'intent' | 'change' | 'search'

export type QueryRequest = {
  readonly kind: QueryKind
  readonly id?: string
  readonly term?: string
  readonly agent?: boolean
}

export type QueryResult =
  | { readonly type: 'package' | 'ownership' | 'intent' | 'change' | 'search'; readonly data: unknown }
  | AgentHandoffV1
  | AgentSearchV1

const handoffForPackage = (
  index: DocBridgeIndexV1,
  id: string,
  config: DocBridgeConfigV1,
): AgentHandoffV1 => {
  const fromIndex = index.handoffs?.[id]
  if (fromIndex) return normalizeAgentHandoff(fromIndex)

  const owner = index.lookup?.ownership?.[id]
  if (!owner) throw new Error(`Unknown package/ownership id "${id}". Try: ak-docs list packages`)

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
    notes: owner.purpose ? [owner.purpose] : [],
  })
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
              score: matches[0].score,
            }
          : null,
        matches: matches.slice(0, 8).map((m) => ({
          type: m.type,
          id: m.id,
          path: m.path,
          ...(m.summary ? { summary: m.summary } : {}),
          score: m.score,
        })),
        nextCommands: matches.slice(0, 5).map((m) =>
          m.type === 'ownership' || m.type === 'knowledge'
            ? `ak-docs query ownership ${m.id} --agent`
            : `ak-docs query package ${m.id} --agent`,
        ),
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