import manifest from '../../../ecosystem.json'
import overrides from '../ecosystem-presentation-overrides.json'

const ecosystem = manifest.products
  .map((product) => ({ ...product, ...overrides[product.id as keyof typeof overrides] }))
const peers = ecosystem.filter((product) => product.id !== 'doc-bridge')

export function EcosystemBar() {
  return (
    <nav className="ecosystem-bar" aria-label="AgentsKit ecosystem">
      <a className="ecosystem-brand" href="https://www.agentskit.io">AgentsKit</a>
      <div className="ecosystem-links">
        {ecosystem.map((product) => <a key={product.id} href={product.home} aria-current={product.id === 'doc-bridge' ? 'page' : undefined}>{product.shortName}</a>)}
      </div>
    </nav>
  )
}

export function EcosystemPeers({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'ecosystem-peers ecosystem-peers-compact' : 'ecosystem-peers'} aria-labelledby={compact ? 'ecosystem-next' : 'ecosystem-heading'}>
      <div className="ecosystem-peers-copy">
        <p className="ecosystem-eyebrow">Continue with context</p>
        <h2 id={compact ? 'ecosystem-next' : 'ecosystem-heading'}>One ecosystem. Six useful next steps.</h2>
        {!compact ? <p>Choose the next constraint you actually have. Every product remains optional and links back into the same workflow.</p> : null}
      </div>
      <div className="ecosystem-peer-grid">
        {peers.map((product, index) => (
          <a key={product.id} href={product.home} className={`ecosystem-peer ecosystem-peer-${product.id}`}>
            <span className="ecosystem-peer-number">0{index + 1}</span>
            <strong>{product.name}</strong>
            <span>{product.hook}</span>
            <span className="ecosystem-peer-action">{product.role} ↗</span>
          </a>
        ))}
      </div>
    </section>
  )
}
