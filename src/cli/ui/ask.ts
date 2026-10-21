import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { runQuery } from '../../query/query.js'
import { searchIndex, type SearchMatch } from '../../query/search.js'
import type { DocBridgeIndexV1 } from '../../schemas/doc-bridge-index.js'

export type AskHandoff = {
  readonly startHere?: string
  readonly editRoots?: readonly string[]
  readonly checks?: readonly string[]
}

/** What `ak-docs ask` knows about a question: the ranked matches, the one to start from, and what to run next. */
export type AskResult = {
  readonly question: string
  readonly best?: SearchMatch
  readonly handoff?: AskHandoff
  readonly matches: readonly SearchMatch[]
  readonly nextCommands: readonly string[]
}

const handoffFor = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, ownerId: string): AskHandoff | undefined => {
  try {
    const handoff = runQuery(index, config, { kind: 'ownership', id: ownerId, agent: true })
    if (!handoff || typeof handoff !== 'object' || !('editRoots' in handoff)) return undefined
    return handoff as AskHandoff
  } catch {
    return undefined
  }
}

/** The same routing `ak-docs ask` prints: prefer an ownership match, then fall back to the top hit. */
export const buildAskResult = (index: DocBridgeIndexV1, config: DocBridgeConfigV1, question: string, limit = 8): AskResult => {
  const matches = searchIndex(index, question, limit)
  const owner = matches.find((match) => match.type === 'ownership') ?? matches.find((match) => Boolean(index.lookup?.ownership?.[match.id]))
  const best = owner ?? matches[0]
  const ownerId = best && (best.type === 'ownership' || index.lookup?.ownership?.[best.id]) ? best.id : undefined
  const handoff = ownerId ? handoffFor(index, config, ownerId) : undefined
  const nextCommands = best
    ? [`ak-docs search "${question}" --agent`, ownerId ? `ak-docs query ownership ${ownerId} --agent` : 'ak-docs list knowledge --text', ...(ownerId ? ['ak-docs doctor --text'] : [])]
    : ['ak-docs list knowledge --text', 'ak-docs doctor --text']
  return { question, ...(best ? { best } : {}), ...(handoff ? { handoff } : {}), matches, nextCommands }
}
