import Link from 'next/link'
import { ArrowRight, Bot, Braces, GitBranch, ShieldCheck, Sparkles, Terminal, Zap } from 'lucide-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { EcosystemShowcase } from '@/components/ecosystem'
import { CopyCode } from '@/components/copy-button'
import { BASE_PATH } from '@/lib/site'

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
    <main className="bg-[#f4f6f1] text-[#111714] dark:bg-[#070a09] dark:text-[#eef2ee]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8" aria-label="Primary navigation">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-[#111714] text-[#55dc91] shadow-lg shadow-emerald-900/20">↔</span>
          AgentsKit / Doc Bridge
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/docs/getting-started" className="hover:text-emerald-700 dark:hover:text-emerald-300">Docs</Link>
          <Link href="/docs/guides/cli-map" className="hover:text-emerald-700 dark:hover:text-emerald-300">CLI</Link>
          <Link href="/for-agents" className="hover:text-emerald-700 dark:hover:text-emerald-300">For agents</Link>
          <a href="https://github.com/AgentsKit-io/doc-bridge" className="hover:text-emerald-700 dark:hover:text-emerald-300">GitHub</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden border-y border-black/5 dark:border-white/10">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(900px 480px at 12% -10%, rgba(53,197,121,0.28), transparent 55%), radial-gradient(700px 400px at 92% 0%, rgba(61,121,242,0.18), transparent 50%), linear-gradient(to right, rgba(17,23,20,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,23,20,0.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 36px 36px, 36px 36px',
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Human ↔ agent documentation bridge
            </p>
            <h1 className="max-w-3xl text-[2.55rem] font-bold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
              One repository.
              <br />
              Two audiences.
              <br />
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-sky-500 bg-clip-text text-transparent dark:from-emerald-300 dark:via-emerald-400 dark:to-sky-300">
                Zero duplicated truth.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">
              Doc Bridge turns ownership into <strong className="font-semibold text-[#111714] dark:text-white">deterministic handoffs</strong>,
              MCP tools, freshness gates, and reviewable memory promotions — <em>before</em> any model burns tokens on the wrong files.
            </p>

            <div className="mt-8 max-w-xl">
              <CopyCode code={installCode} title="install" language="bash" />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs/getting-started"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#111714] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-black dark:bg-emerald-400 dark:text-black"
              >
                Run the 60-second proof <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/docs/guides/memory-pipeline"
                className="inline-flex min-h-12 items-center rounded-full border border-black/15 px-5 py-3 text-sm font-medium transition hover:border-emerald-600/50 dark:border-white/15"
              >
                Memory → docs
              </Link>
              <Link
                href="/docs/guides/mcp-agents"
                className="inline-flex min-h-12 items-center rounded-full border border-black/15 px-5 py-3 text-sm font-medium transition hover:border-emerald-600/50 dark:border-white/15"
              >
                MCP
              </Link>
              <a
                href={`${BASE_PATH}/llms.txt`}
                className="inline-flex min-h-12 items-center rounded-full border border-black/15 px-5 py-3 text-sm font-medium transition hover:border-emerald-600/50 dark:border-white/15"
              >
                llms.txt
              </a>
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

          <div className="lg:pl-4">
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
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Why it wins</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Not another wiki. A bridge that agents can execute.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(([Icon, title, body]) => (
            <article
              key={title}
              className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
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
      <section className="bg-[#0d1311] px-5 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Human ↔ agent loop</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            A feedback system — not another documentation silo.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/15 md:grid-cols-4">
            {(
              [
                [Terminal, 'Human docs', 'Explain intent and operation.'],
                [Braces, 'Ownership map', 'Source, checks, edit roots.'],
                [Bot, 'Agent handoff', 'Compact deterministic context.'],
                [GitBranch, 'Memory promote', 'Draft PR from durable learnings.'],
              ] as const
            ).map(([Icon, title, copy]) => (
              <article key={title} className="bg-[#0d1311] p-6">
                <Icon className="size-6 text-emerald-300" />
                <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <EcosystemShowcase />
    </main>
  )
}
