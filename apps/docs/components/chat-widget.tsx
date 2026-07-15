'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createAskAdapter, createAskSessionMemory, defineChat, defineComponentManifest, StandardComponentCatalog } from '@agentskit/chat'
import { AgentChat } from '@agentskit/chat/react'
import { createDiscoveryAdapter, loadDiscovery, type DiscoveryInputs } from '@/lib/discovery'

const components = defineComponentManifest(StandardComponentCatalog)

export default function ChatWidget({ onClose }: { readonly onClose: () => void }) {
  const [inputs, setInputs] = useState<DiscoveryInputs | null | undefined>()
  const [path, setPath] = useState<'local' | 'pending' | 'backend' | null>(null)
  const discoveryPromise = useRef<Promise<DiscoveryInputs | null> | null>(null)
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

  useEffect(() => {
    discoveryPromise.current ??= loadDiscovery()
    let active = true
    void discoveryPromise.current.then((result) => { if (active) setInputs(result) })
    return () => { active = false }
  }, [])
  const definition = useMemo(() => {
    const fallback = createAskAdapter({ endpoint: process.env.NEXT_PUBLIC_ASK_ENDPOINT ?? 'https://ask.agentskit.io/v1/ask', corpus: 'doc-bridge' })
    const answer = createDiscoveryAdapter({
      inputs: inputs ?? null,
      fallback,
      onDecision: (decision) => setPath(decision.outcome === 'answer' ? decision.provenance.source : decision.outcome === 'choices' ? 'local' : 'pending'),
      onBackendStart: () => setPath('pending'),
      onBackendAnswer: () => setPath('backend'),
    })
    return defineChat({
      id: 'ask-doc-bridge',
      components,
      ...(answer.deterministic ? { choiceSubmission: answer.deterministic.resolveChoiceSubmission } : {}),
      chat: { adapter: answer.adapter, memory: createAskSessionMemory({ key: 'ak:ask-thread-v1:doc-bridge' }) },
    })
  }, [inputs])

  return (
    <section className="fixed inset-x-3 bottom-3 z-50 flex h-[min(640px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c120f] text-white shadow-2xl sm:left-auto sm:w-[440px]" role="dialog" aria-label="Ask Doc Bridge" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <header className="flex min-h-14 items-center justify-between border-b border-white/10 px-4"><div><strong className="text-sm">Ask Doc Bridge</strong><p className="text-xs text-white/55">deterministic first · backend when needed</p></div><button className="min-h-11 min-w-11 rounded-full text-xl hover:bg-white/10" type="button" aria-label="Close chat" onClick={onClose}>×</button></header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {inputs === undefined ? <p className="p-4 text-sm text-white/65" role="status">Loading the local knowledge artifact…</p> : <AgentChat definition={definition} placeholder="Ask about setup, MCP, gates, or ownership…" theme={{ colors: { accent: '#55dc91' }, radius: { medium: 12, large: 16 } }} />}
      </div>
      <footer className="flex min-h-11 items-center justify-between border-t border-white/10 px-4 text-xs text-white/55"><a className="text-emerald-300" href={`${basePath}/docs/getting-started`}>Browse docs →</a>{path ? <span data-answer-path={path}>{path === 'local' ? 'instant · local' : path === 'backend' ? 'completed · backend' : 'consulting backend'}</span> : null}</footer>
    </section>
  )
}
