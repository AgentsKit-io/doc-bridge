import Link from 'next/link'
import ecosystem from '../../../ecosystem.json'

const publicProducts = ecosystem.products
  .filter((product) => product.navigation.showInBar)
  .sort((left, right) => left.navigation.order - right.navigation.order)

export function SiteFooter() {
  return (
    <footer className="border-t border-black/10 bg-white/45 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-black/10 pb-8 sm:flex-row sm:items-end dark:border-white/10">
          <div className="max-w-xl">
            <p className="font-semibold tracking-tight">AgentsKit / Doc Bridge</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
              One repository knowledge layer for humans and agents.
            </p>
          </div>
          <nav aria-label="Doc Bridge resources" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link href="/docs/getting-started" className="hover:text-emerald-700 dark:hover:text-emerald-300">Docs</Link>
            <Link href="/for-agents" className="hover:text-emerald-700 dark:hover:text-emerald-300">For agents</Link>
            <a href="https://github.com/AgentsKit-io/doc-bridge" className="hover:text-emerald-700 dark:hover:text-emerald-300">GitHub</a>
          </nav>
        </div>

        <nav aria-label="AgentsKit ecosystem" className="grid gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-3 lg:grid-cols-6 dark:border-white/10 dark:bg-white/10">
          {publicProducts.map((product) => {
            const current = product.id === 'doc-bridge'
            return (
              <a
                key={product.id}
                href={product.surfaces.home}
                aria-current={current ? 'page' : undefined}
                className="min-w-0 bg-[var(--bridge-paper)] px-4 py-5 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 dark:bg-[var(--bridge-night)] dark:hover:bg-white/[0.06]"
              >
                <span className="block text-sm font-semibold">{product.shortName}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                  {product.promise}
                </span>
              </a>
            )
          })}
        </nav>

        <p className="mt-6 text-xs text-neutral-500">
          Six products. One connected agent toolkit.
        </p>
      </div>
    </footer>
  )
}
