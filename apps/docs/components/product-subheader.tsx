'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { LargeSearchToggle, SearchToggle } from 'fumadocs-ui/components/layout/search-toggle'
import { useState } from 'react'

const links = [
  { href: '/docs/getting-started', label: 'Docs' },
  { href: '/docs/guides/cli-map', label: 'CLI' },
  { href: '/for-agents', label: 'For agents' },
  { href: 'https://github.com/AgentsKit-io/doc-bridge', label: 'GitHub', external: true },
] as const

export function ProductSubheader() {
  const [open, setOpen] = useState(false)

  return (
    <header
      className="sticky top-0 z-40 h-14 border-b border-black/10 bg-[var(--bridge-paper)] text-[var(--bridge-ink)] dark:border-white/10 dark:bg-[var(--bridge-night)] dark:text-[var(--bridge-paper-strong)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <nav className="relative mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-5 lg:px-8" aria-label="Doc Bridge navigation">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--bridge-ink)] text-[var(--bridge-green)] dark:bg-[var(--bridge-paper-strong)] dark:text-emerald-700" aria-hidden>↔</span>
          <span className="truncate"><span className="hidden sm:inline">AgentsKit / </span>Doc Bridge</span>
        </Link>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((link) => 'external' in link && link.external ? (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-neutral-600 transition-colors hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-300">
              {link.label}
            </a>
          ) : (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-neutral-600 transition-colors hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-300">
              {link.label}
            </Link>
          ))}
          <LargeSearchToggle aria-label="Search Doc Bridge documentation" className="ml-1 min-h-11 w-40 border-black/10 bg-white/55 dark:border-white/10 dark:bg-white/[0.04]" />
        </div>

        <div className="ml-auto flex items-center md:hidden">
          <SearchToggle aria-label="Search Doc Bridge documentation" className="size-11" />
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-white/10"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="doc-bridge-mobile-menu"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {open ? (
          <div id="doc-bridge-mobile-menu" className="absolute inset-x-0 top-full grid gap-1 border-b border-black/10 bg-[var(--bridge-paper)] p-3 shadow-lg dark:border-white/10 dark:bg-[var(--bridge-night)] md:hidden">
            {links.map((link) => 'external' in link && link.external ? (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 dark:hover:bg-white/10" onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 dark:hover:bg-white/10" onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>
    </header>
  )
}
