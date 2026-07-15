import Link from 'next/link'
import { ArrowRight, Bot, Braces, GitBranch, Terminal } from 'lucide-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { EcosystemPeers } from '@/components/ecosystem'

const proof = [
  ['Index', 'ak-docs index', 'Build the local knowledge map from source docs.'],
  ['Resolve', 'ak-docs query package doc-bridge --agent', 'Return an exact, machine-readable handoff.'],
  ['Gate', 'ak-docs gate run', 'Fail drift before incomplete context reaches an agent.'],
] as const

const basePath = process.env.DOCS_BASE_PATH ?? ''
const sourceCount = readdirSync(resolve(process.cwd(), '../../docs'), { recursive: true })
  .filter((path) => typeof path === 'string' && path.endsWith('.md')).length

export default function HomePage() {
  return (
    <main>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8" aria-label="Primary navigation">
        <Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-[#111714] text-[#55dc91]">↔</span>AgentsKit / Doc Bridge</Link>
        <div className="flex items-center gap-4 text-sm"><Link href="/docs/getting-started">Docs</Link><a href="https://github.com/AgentsKit-io/doc-bridge">GitHub</a></div>
      </nav>

      <section className="bridge-grid border-y px-5 py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
          <div>
            <p className="mb-5 font-mono text-xs uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">Documentation infrastructure for humans + agents</p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-7xl">One repository.<br />Two audiences.<br /><span className="text-emerald-600">No duplicated truth.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">Doc Bridge converts documentation ownership into deterministic handoffs, MCP tools, freshness gates, and human links—locally, before any model or backend is called.</p>
            <div className="mt-9 flex flex-wrap gap-3"><Link href="/docs/getting-started" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111714] px-5 py-3 font-medium text-white dark:bg-white dark:text-black">Run the 60-second proof <ArrowRight className="size-4" /></Link><Link href="/for-agents" className="inline-flex min-h-11 items-center rounded-full border px-5 py-3 font-medium">For agents</Link><Link href="/docs/MARKETPLACE" className="inline-flex min-h-11 items-center rounded-full border px-5 py-3 font-medium">GitHub Marketplace</Link></div>
          </div>
          <div className="overflow-hidden rounded-3xl border bg-[#101713] p-2 text-[#d8e4dc] shadow-2xl shadow-emerald-950/15" aria-label="Doc Bridge command output">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-mono text-xs text-white/50"><span className="size-2 rounded-full bg-red-400" /><span className="size-2 rounded-full bg-amber-300" /><span className="size-2 rounded-full bg-emerald-400" /> deterministic handoff</div>
            <pre className="overflow-x-auto p-5 text-sm leading-7"><code>{`$ npx @agentskit/doc-bridge index\n✓ ${sourceCount} knowledge sources indexed\n\n$ npx ak-docs query package doc-bridge --agent\n{\n  "startHere": "docs/POSITIONING.md",\n  "editRoots": ["src"],\n  "checks": ["pnpm test", "pnpm typecheck"]\n}\n\nbackend calls: 0`}</code></pre>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="font-mono text-xs uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">The proof</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Useful before AI enters the loop.</h2><p className="mt-5 leading-7 text-neutral-600 dark:text-neutral-300">Known questions stay local and fast. Ambiguity is surfaced with provenance. Only an unresolved question earns a backend request.</p></div><ol className="divide-y border-y">{proof.map(([title, command, description], index) => <li key={title} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr] sm:gap-5"><span className="font-mono text-emerald-700 dark:text-emerald-300">0{index + 1}</span><div><h3 className="text-xl font-semibold">{title}</h3><code className="mt-2 block overflow-x-auto rounded-lg bg-neutral-950 p-3 text-sm text-emerald-300">{command}</code><p className="mt-3 text-neutral-600 dark:text-neutral-300">{description}</p></div></li>)}</ol></div>
      </section>

      <section className="border-y bg-[#111714] px-5 py-20 text-white"><div className="mx-auto max-w-7xl"><p className="font-mono text-xs uppercase tracking-[.2em] text-emerald-300">Human ↔ agent loop</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">The bridge is a feedback system, not another documentation silo.</h2><div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/15 md:grid-cols-4">{[[Terminal,'Human docs','Explain intent and operation.'],[Braces,'Ownership map','Points to source, checks, and context.'],[Bot,'Agent handoff','Delivers compact deterministic context.'],[GitBranch,'Promotion loop','Turns durable learnings back into docs.']].map(([Icon,title,copy]) => { const C = Icon as typeof Terminal; return <article key={String(title)} className="bg-[#111714] p-6"><C className="size-6 text-emerald-300" /><h3 className="mt-8 text-lg font-semibold">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-white/65">{String(copy)}</p></article>})}</div></div></section>

      <EcosystemPeers />
    </main>
  )
}
