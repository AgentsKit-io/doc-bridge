import Link from 'next/link'
import ecosystem from '../../../ecosystem.json'

const publicProducts = ecosystem.products
  .filter((product) => product.navigation.showInBar)
  .sort((left, right) => left.navigation.order - right.navigation.order)

const columns = [
  {
    title: 'Start',
    links: [
      { text: 'Get started', href: '/docs/getting-started' },
      { text: 'Install and run', href: '/docs/guides/install-and-run' },
      { text: 'CLI guide', href: '/docs/guides/cli-map' },
    ],
  },
  {
    title: 'Build',
    links: [
      { text: 'Index and query', href: '/docs/guides/index-and-query' },
      { text: 'Gate and CI', href: '/docs/guides/gate-ci' },
      { text: 'MCP for agents', href: '/docs/guides/mcp-agents' },
    ],
  },
  {
    title: 'Ecosystem',
    links: publicProducts.map((product) => ({
      text: product.shortName,
      href: product.surfaces.home,
      external: true,
    })),
  },
  {
    title: 'Community',
    links: [
      { text: 'GitHub', href: 'https://github.com/AgentsKit-io/doc-bridge', external: true },
      { text: 'Contribute', href: 'https://github.com/AgentsKit-io/doc-bridge/blob/main/CONTRIBUTING.md', external: true },
      { text: 'For agents · llms.txt', href: '/llms.txt' },
      { text: 'npm', href: 'https://www.npmjs.com/package/@agentskit/doc-bridge', external: true },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="bridge-home-footer px-5 pt-14 pb-10 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.04] font-mono text-sm text-emerald-300" aria-hidden>↔</span>
              <span className="font-mono text-base font-bold tracking-tight">Doc Bridge</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-neutral-400">
              One repository knowledge layer for people and agents.
            </p>
            <div className="mt-5 flex gap-3">
              <a href="https://github.com/AgentsKit-io/doc-bridge" target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-400 transition hover:text-white">GitHub</a>
              <a href="https://www.npmjs.com/package/@agentskit/doc-bridge" target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-neutral-400 transition hover:text-white">npm</a>
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title} className="min-w-0" data-footer-column={column.title}>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400">{column.title}</h2>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${link.text}-${link.href}`}>
                    {'external' in link && link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" aria-current={link.text === 'Doc Bridge' ? 'page' : undefined} data-current-product={link.text === 'Doc Bridge' ? 'true' : undefined} className="text-sm text-neutral-400 transition hover:text-white">{link.text}</a>
                    ) : (
                      <Link href={link.href} className="text-sm text-neutral-400 transition hover:text-white">{link.text}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
