import { PRODUCT_ID } from '@/lib/shell'

/**
 * Shared AgentsKit ecosystem tour, upgraded by shell v1. The children are the
 * server-rendered fallback copy shown before (or without) the shell script.
 * Docs pages use the same theme-aware `agentskit-home` visual: the shell's default
 * visual is dark-only and becomes unreadable on light documentation pages.
 */
export function EcosystemShowcase({ compact = false }: { compact?: boolean }) {
  return (
    <agentskit-ecosystem current={PRODUCT_ID} data-visual="agentskit-home">
      <section className={compact ? 'ecosystem-peers ecosystem-peers-compact' : 'ecosystem-peers'}>
        <div className="ecosystem-peers-copy">
          <p className="ecosystem-eyebrow">The AgentsKit ecosystem</p>
          <h2>Build the agent. Then take it all the way.</h2>
          {!compact ? <p>One connected toolkit from ready-made source to governed production.</p> : null}
        </div>
      </section>
    </agentskit-ecosystem>
  )
}
