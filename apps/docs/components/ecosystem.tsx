import { createElement } from 'react'

export function EcosystemShowcase({ compact = false }: { compact?: boolean }) {
  return createElement(
    'agentskit-ecosystem',
    { current: 'doc-bridge' },
    <section className={compact ? 'ecosystem-peers ecosystem-peers-compact' : 'ecosystem-peers'}>
      <div className="ecosystem-peers-copy">
        <p className="ecosystem-eyebrow">The AgentsKit ecosystem</p>
        <h2>Build the agent. Then take it all the way.</h2>
        {!compact ? <p>One connected toolkit from ready-made source to governed production.</p> : null}
      </div>
    </section>,
  )
}
