import Link from 'next/link'
import { ArrowRight, Bot, Braces, GitBranch, ShieldCheck, Sparkles, Terminal, Zap } from 'lucide-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { EcosystemShowcase } from '@/components/ecosystem'
import { CopyCode } from '@/components/copy-button'
import { ProductSubheader } from '@/components/product-subheader'
import { SiteFooter } from '@/components/site-footer'

const proof = [
  ['Index', 'ak-docs index', 'Build a deterministic knowledge map from source docs — offline.'],
  ['Resolve', 'ak-docs query package auth --agent', 'Exact handoff JSON: startHere, editRoots, checks.'],
  ['Gate', 'ak-docs gate run', 'Fail stale context before incomplete prompts hit a model.'],
] as const

const pillars = [
  [Zap, 'Deterministic first', 'Known questions never burn tokens. Provenance stays in the repository.'],
  [ShieldCheck, 'Fail-closed gates', 'CI refuses drift. Agents inherit the same truth as humans.'],
  [Bot, 'MCP-native', 'Cursor, Claude, Codex — same handoffs as the CLI, not a second corpus.'],
  [Sparkles, 'Memory → docs', 'Digest agent notes, classify, promote as reviewable drafts — never silent merge.'],
] as const

const sourceCount = readdirSync(resolve(process.cwd(), '../../docs'), { recursive: true })
  .filter(
    (path) =>
      typeof path === 'string'
      && path.endsWith('.md')
      && !String(path).includes('DOGFOOD')
      && !String(path).startsWith('landing')
      && !String(path).startsWith('agent-corpus'),
  ).length

const installCode = `pnpm add -D @agentskit/doc-bridge
# or: npm i -D @agentskit/doc-bridge`

const proofCode = `$ npx ak-docs demo --text
# 60s: handoff · gate red→green · MCP snippet

$ ak-docs index
✓ ${sourceCount} knowledge sources indexed

$ ak-docs query package doc-bridge --agent
{
  "startHere": "docs/POSITIONING.md",
  "editRoots": ["src"],
  "checks": ["pnpm test", "pnpm typecheck"]
}

backend calls: 0`

export default function HomePage() {
  return (
    <>
      <ProductSubheader />
      <main className="bg-[var(--bridge-paper)] text-[var(--bridge-ink)] dark:bg-[var(--bridge-night)] dark:text-[var(--bridge-paper-strong)]">
      {/* HERO */}
      <section className="bridge-hero relative overflow-hidden border-y border-black/5 dark:border-white/10">
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div className="min-w-0">
            <p className="mb-5 flex max-w-full items-start gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
              <span className="mt-[0.45rem] h-px w-6 shrink-0 bg-emerald-600 dark:bg-emerald-300" aria-hidden />
              <span className="min-w-0">Human ↔ agent documentation bridge</span>
            </p>
            <h1 className="max-w-3xl text-[2.55rem] font-bold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
              One repository.
              <br />
              Two audiences.
              <br />
              <span className="text-emerald-700 dark:text-emerald-300">
                Zero duplicated truth.
              </span>
            </h1>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/docs/getting-started"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--bridge-ink)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-400 dark:text-black dark:hover:bg-emerald-300 sm:w-auto"
              >
                Generate your first handoff <ArrowRight className="size-4" />
              </Link>
              <a
                href="#knowledge-flow"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-black/15 px-5 py-3 text-sm font-medium transition-colors hover:border-emerald-600/50 dark:border-white/15 sm:w-auto"
              >
                See how knowledge flows
              </a>
            </div>

            <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">
              Doc Bridge turns ownership into <strong className="font-semibold text-[var(--bridge-ink)] dark:text-white">deterministic handoffs</strong>,
              MCP tools, freshness gates, and reviewable memory promotions — <em>before</em> any model burns tokens on the wrong files.
            </p>

            <div className="mt-8 max-w-xl">
              <CopyCode code={installCode} title="install" language="bash" />
            </div>

            <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-black/10 pt-8 dark:border-white/10">
              {[
                ['Layer 0', 'No API key'],
                ['MCP', 'Same handoffs'],
                ['Gates', 'Fail-closed CI'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">{k}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0 lg:pl-4">
            <CopyCode code={proofCode} title="deterministic handoff" language="bash" />
            <p className="mt-3 text-center font-mono text-[11px] text-neutral-500">
              Live corpus · {sourceCount} indexed public sources · copy any command
            </p>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">The bridge contract</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Not another wiki. A bridge that agents can execute.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(([Icon, title, body]) => (
            <article
              key={title}
              className="rounded-xl border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <Icon className="size-6 text-emerald-600 dark:text-emerald-300" />
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* PROOF STEPS */}
      <section className="border-y border-black/5 bg-white/50 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.7fr_1.3fr] lg:px-8 lg:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">The proof</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Useful before AI enters the loop.</h2>
            <p className="mt-5 leading-7 text-neutral-600 dark:text-neutral-400">
              Known questions stay local and fast. Ambiguity surfaces with provenance. Only an unresolved miss earns a backend call.
            </p>
            <Link
              href="/docs/guides/cli-map"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
            >
              Full CLI map <ArrowRight className="size-4" />
            </Link>
          </div>
          <ol className="divide-y divide-black/10 dark:divide-white/10">
            {proof.map(([title, command, description], index) => (
              <li key={title} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr] sm:gap-5">
                <span className="font-mono text-emerald-700 dark:text-emerald-300">0{index + 1}</span>
                <div>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <div className="mt-3">
                    <CopyCode code={command} title="command" />
                  </div>
                  <p className="mt-3 text-neutral-600 dark:text-neutral-400">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* LOOP */}
      <section id="knowledge-flow" className="scroll-mt-24 bg-[var(--bridge-panel)] px-5 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Human ↔ agent loop</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            A feedback system — not another documentation silo.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/15 md:grid-cols-4">
            {(
              [
                [Terminal, 'Human docs', 'Explain intent and operation.'],
                [Braces, 'Ownership map', 'Source, checks, edit roots.'],
                [Bot, 'Agent handoff', 'Compact deterministic context.'],
                [GitBranch, 'Memory promote', 'Draft PR from durable learnings.'],
              ] as const
            ).map(([Icon, title, copy]) => (
              <article key={title} className="bg-[var(--bridge-panel)] p-6">
                <Icon className="size-6 text-emerald-300" />
                <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-black/5 px-5 py-16 dark:border-white/10 lg:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              One source of truth
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Make your repository understandable to humans and agents.
            </h2>
            <p className="mt-5 max-w-2xl leading-7 text-neutral-600 dark:text-neutral-400">
              Turn ownership, documentation, and durable agent findings into knowledge both sides can trust.
            </p>
          </div>
          <Link
            href="/docs/getting-started"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md bg-[var(--bridge-ink)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-400 dark:text-black dark:hover:bg-emerald-300"
          >
            Add Doc Bridge to your repo <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <EcosystemShowcase />
      </main>
      <SiteFooter />
    </>
  )
}
