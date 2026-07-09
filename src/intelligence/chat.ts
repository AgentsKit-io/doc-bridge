import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { runQuery } from '../query/query.js'
import { resolveIntelligenceRuntime } from './adapter.js'
import {
  PeerMissingError,
  importPeer,
  isPeerResolutionFailure,
  layer1InstallHint,
} from './peers.js'
import { createDocBridgeRag } from './rag.js'

const wrapIntelligenceError = (error: unknown): Error => {
  if (error instanceof PeerMissingError) return error
  if (isPeerResolutionFailure(error)) {
    return new PeerMissingError('@agentskit/*', layer1InstallHint())
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch failed|econnrefused|enotfound|network|socket/i.test(message)) {
    return new Error(
      `Intelligence provider request failed (${message}).\n` +
        `Check the model server (e.g. \`ollama serve\`) and Layer 1 peers:\n  ${layer1InstallHint()}`,
    )
  }
  return error instanceof Error ? error : new Error(message)
}

const handoffFirstHint = (
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
  question: string,
): string | undefined => {
  if (config.intelligence?.chat?.handoffFirst === false) return undefined
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9@/_-]+/)
    .filter((t) => t.length >= 2)
  const packages = index.lookup?.packages ?? []
  const hit = packages.find((id) => tokens.includes(id.toLowerCase()))
  if (!hit) return undefined
  try {
    const handoff = runQuery(index, config, { kind: 'ownership', id: hit, agent: true })
    return [
      '## Deterministic AgentHandoff (prefer for edits)',
      '```json',
      JSON.stringify(handoff, null, 2),
      '```',
      'Use startHere / editRoots / checks before broad exploration.',
    ].join('\n')
  } catch {
    return undefined
  }
}

const systemPrompt = (
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
  provider: string,
  model: string | undefined,
  question?: string,
): string => {
  const prefix = question ? handoffFirstHint(index, config, question) : undefined
  return [
    'You are a documentation assistant for this repository (doc-bridge).',
    'Prefer deterministic AgentHandoff fields for code edits.',
    'Cite file paths from retrieved context.',
    `Provider: ${provider}${model ? ` / ${model}` : ''}.`,
    'If unsure, suggest: ak-docs query ownership <id> --agent or MCP handoff.resolve.',
    prefix ?? '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const runChatOnce = async (
  root: string,
  config: DocBridgeConfigV1,
  index: DocBridgeIndexV1,
  question: string,
): Promise<{ content: string; handoffPrefixed: boolean }> => {
  try {
    const { adapter, provider, model } = await resolveIntelligenceRuntime(config)
    const core = await importPeer<typeof import('@agentskit/core')>('@agentskit/core')
    const rag = await createDocBridgeRag(root, config, index)
    await rag.ingest()

    const controller = core.createChatController({
      adapter,
      retriever: rag.retriever,
      system: systemPrompt(index, config, provider, model, question),
    })

    const result = await controller.send(question)
    const content =
      typeof result?.content === 'string' ? result.content : JSON.stringify(result, null, 2)

    return {
      content,
      handoffPrefixed: Boolean(handoffFirstHint(index, config, question)),
    }
  } catch (error) {
    throw wrapIntelligenceError(error)
  }
}

export const startInkChat = async (
  root: string,
  config: DocBridgeConfigV1,
  index: DocBridgeIndexV1,
): Promise<void> => {
  try {
    const { adapter, provider, model } = await resolveIntelligenceRuntime(config)
    const rag = await createDocBridgeRag(root, config, index)
    await rag.ingest()

    const React = await importPeer<typeof import('react')>('react')
    const ink = await importPeer<typeof import('ink')>('ink')
    const agentskitInk = await importPeer<typeof import('@agentskit/ink')>('@agentskit/ink')

    const App = () => {
      const chat = agentskitInk.useChat({
        adapter,
        retriever: rag.retriever,
        system: systemPrompt(index, config, provider, model),
      })

      return React.createElement(
        agentskitInk.ChatContainer as never,
        null,
        ...chat.messages.map((msg) =>
          React.createElement(agentskitInk.Message as never, {
            key: msg.id,
            message: msg,
          } as never),
        ),
        React.createElement(agentskitInk.InputBar as never, {
          chat,
          placeholder: 'Ask about project docs (handoff-first RAG)…',
        } as never),
      )
    }

    const instance = ink.render(React.createElement(App))
    await instance.waitUntilExit()
  } catch (error) {
    throw wrapIntelligenceError(error)
  }
}
