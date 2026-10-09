import type { AdapterFactory } from '@agentskit/core'
import type { RegionProvider } from './llm.js'

/** Consume the ecosystem Adapter contract without tool execution or filesystem access. */
export const regionProviderFromAdapter = (adapter: AdapterFactory): RegionProvider => async ({ prompt, maxTokens, signal }) => {
  signal.throwIfAborted()
  const source = adapter.createSource({ messages: [{ id: 'region-remediation', role: 'user', content: prompt, status: 'complete', createdAt: new Date(0) }], context: { maxTokens, temperature: 0 } })
  const abort = () => source.abort()
  signal.addEventListener('abort', abort, { once: true })
  let text = '', done = false
  try {
    for await (const chunk of source.stream()) {
      signal.throwIfAborted()
      if (chunk.type === 'error' || chunk.type === 'tool_call' || chunk.type === 'tool_result') throw new Error('PROVIDER_FAILED')
      if (chunk.type === 'text') text += chunk.content ?? ''
      if (Buffer.byteLength(text) > maxTokens) throw new Error('OUTPUT_BUDGET')
      if (chunk.type === 'done') { done = true; break }
    }
    if (!done) throw new Error('INCOMPLETE_RESPONSE')
    return JSON.parse(text) as unknown
  } finally { signal.removeEventListener('abort', abort); source.abort() }
}

/** Scripted and key-free; exhaustion fails instead of silently repeating a response. */
export const scriptedRegionProvider = (responses: readonly unknown[]): RegionProvider => {
  let index = 0
  return async ({ signal }) => {
    signal.throwIfAborted()
    if (index >= responses.length) throw new Error('SCRIPT_EXHAUSTED')
    return responses[index++]
  }
}
