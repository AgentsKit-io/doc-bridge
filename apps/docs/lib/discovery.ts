import type { AdapterFactory } from '@agentskit/core'
import { createDeterministicAnswerAdapter, type AskAdapter, type DeterministicAnswerAdapter } from '@agentskit/chat'
import { decodeDeterministicSiteConfig, verifyLocalKnowledgeArtifactSync, type AnswerResponse } from '@agentskit/chat-protocol'

export interface DiscoveryInputs { readonly siteConfig: unknown; readonly artifact: unknown }

export async function loadDiscovery(fetchImpl: typeof fetch = fetch): Promise<DiscoveryInputs | null> {
  const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  try {
    const signal = AbortSignal.timeout(6_500)
    const [siteConfig, artifact] = await Promise.all([
      fetchImpl(`${prefix}/deterministic/site-config.json`, { signal }),
      fetchImpl(`${prefix}/deterministic/knowledge.json`, { signal }),
    ])
    if (!siteConfig.ok || !artifact.ok) return null
    return { siteConfig: await siteConfig.json(), artifact: await artifact.json() }
  } catch { return null }
}

export function createDiscoveryAdapter({
  inputs, fallback, onDecision, onBackendStart, onBackendAnswer,
}: {
  readonly inputs: DiscoveryInputs | null
  readonly fallback: AdapterFactory & Partial<Pick<AskAdapter, 'createSourceForSession'>>
  readonly onDecision?: (decision: AnswerResponse) => void
  readonly onBackendStart?: () => void
  readonly onBackendAnswer?: () => void
}): { readonly adapter: AdapterFactory; readonly deterministic: DeterministicAnswerAdapter | null } {
  const observe = (source: ReturnType<AdapterFactory['createSource']>) => ({
    abort: () => source.abort(),
    async *stream() {
      let text = false
      let failed = false
      for await (const chunk of source.stream()) {
        if (chunk.type === 'text' && chunk.content?.trim()) text = true
        if (chunk.type === 'error') failed = true
        if (chunk.type === 'done' && text && !failed) onBackendAnswer?.()
        yield chunk
      }
    },
  })
  const site = decodeDeterministicSiteConfig(inputs?.siteConfig)
  if (!site.ok) return {
    deterministic: null,
    adapter: {
      capabilities: fallback.capabilities,
      createSource: (request) => { onBackendStart?.(); return observe(fallback.createSource(request)) },
    },
  }
  const artifact = verifyLocalKnowledgeArtifactSync(inputs?.artifact, {
    expectedContentHash: site.value.artifact.contentHash,
    expectedSiteId: site.value.siteId,
  })
  let sessionId = 'unscoped'
  const forwardedFallback: AdapterFactory = {
    capabilities: fallback.capabilities,
    createSource: (request) => fallback.createSourceForSession?.(request, sessionId) ?? fallback.createSource(request),
  }
  const base = createDeterministicAnswerAdapter({
    artifact: artifact.ok ? artifact.value : null,
    expectedContentHash: site.value.artifact.contentHash,
    expectedSiteId: site.value.siteId,
    fallbackMode: site.value.fallback.mode,
    fallback: forwardedFallback,
    backend: { provider: 'ask-doc-bridge' },
    onDecision,
  })
  const deterministic: DeterministicAnswerAdapter = {
    ...base,
    createSourceForSession: (request, activeSessionId) => {
      sessionId = activeSessionId
      try { return base.createSourceForSession(request, activeSessionId) }
      finally { sessionId = 'unscoped' }
    },
  }
  return { adapter: deterministic, deterministic }
}
