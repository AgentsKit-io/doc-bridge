import Link from 'next/link'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import { ArrowRight, Bot, GitBranch, ShieldCheck, Terminal, Zap } from 'lucide-react'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { HandoffProof } from '@/components/home/handoff-proof'
import { InstallCommandTabs } from '@/components/home/install-command-tabs'
import { ProofTerminal } from '@/components/home/proof-terminal'
import { EcosystemShowcase } from '@/components/ecosystem'
import { ProductSubheader } from '@/components/product-subheader'
import { SiteFooter } from '@/components/site-footer'
import './home.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })

const principles = [
  [Zap, 'Deterministic by default', 'Known questions stay local. Every answer keeps its source.'],
  [ShieldCheck, 'Freshness you can enforce', 'CI catches drift before stale context reaches an agent.'],
  [Bot, 'One handoff, every surface', 'MCP and CLI share the same repository-backed context.'],
  [GitBranch, 'Knowledge returns to docs', 'Agent findings become reviewable drafts, never silent edits.'],
] as const

const sourceCount = readdirSync(resolve(process.cwd(), '../../docs'), { recursive: true })
  .filter((path) => typeof path === 'string' && path.endsWith('.md') && !String(path).includes('DOGFOOD') && !String(path).startsWith('landing') && !String(path).startsWith('agent-corpus')).length

export default function HomePage() {
  return (
    <div className={`bridge-home ${inter.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}>
      <agentskit-aurora aria-hidden="true" />
      <ProductSubheader />
      <main className="bridge-home-content">
        <section className="bridge-home-hero">
          <div className="bridge-home-hero-inner">
            <div className="bridge-hero-copy">
              <p className="bridge-eyebrow"><span className="bridge-eyebrow-line" />ONE REPOSITORY · TWO AUDIENCES</p>
              <h1>The docs your team reads.<br /><span>The context your agents need.</span></h1>
              <p className="bridge-hero-description">Connect Fumadocs, Docusaurus, and Markdown to repository-backed MCP and CLI handoffs. Return agent memory as reviewable documentation.</p>
              <div className="bridge-hero-actions">
                <Link href="/docs/getting-started" className="bridge-button bridge-button-primary">Generate your first handoff <ArrowRight aria-hidden className="size-4" /></Link>
                <a href="#proof" className="bridge-button bridge-button-secondary">See the handoff</a>
              </div>
            </div>
            <HandoffProof />
            <div className="bridge-install">
              <span className="bridge-eyebrow">ADD TO YOUR REPOSITORY</span>
              <InstallCommandTabs />
            </div>
          </div>
        </section>

        <section className="bridge-principles" aria-labelledby="principles-title">
          <div className="bridge-section-heading">
            <p className="bridge-eyebrow">THE BRIDGE CONTRACT</p>
            <h2 id="principles-title">One source of truth. A useful handoff.</h2>
          </div>
          <div className="bridge-principle-list">
            {principles.map(([Icon, title, copy], index) => (
              <article className="bridge-principle" key={title}>
                <span className="bridge-principle-index">0{index + 1}</span>
                <Icon aria-hidden className="bridge-principle-icon" />
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="proof" className="bridge-proof-section">
          <div className="bridge-proof-inner">
            <div className="bridge-proof-intro">
              <p className="bridge-eyebrow">THE PROOF</p>
              <h2>Useful before AI enters the loop.</h2>
              <p>Known questions stay local and fast. Ambiguity surfaces with provenance. Only an unresolved miss earns a backend call.</p>
              <Link href="/docs/guides/cli-map" className="bridge-text-link">Explore the CLI <ArrowRight aria-hidden className="size-4" /></Link>
              <p className="bridge-proof-count">{sourceCount} indexed knowledge sources</p>
            </div>
            <div className="bridge-proof-code"><ProofTerminal sourceCount={sourceCount} /></div>
          </div>
        </section>

        <section id="knowledge-flow" className="bridge-knowledge-flow">
          <div className="bridge-knowledge-inner">
            <div className="bridge-section-heading">
              <p className="bridge-eyebrow">HUMAN ↔ AGENT LOOP</p>
              <h2>A feedback system, grounded in your repository.</h2>
              <p>Documentation stays readable for people and structured enough for agents to use responsibly.</p>
            </div>
            <div className="bridge-flow-list">
              {([
                [Terminal, 'People document intent', 'Explain the decisions, systems, and workflows that matter.'],
                [ShieldCheck, 'Doc Bridge resolves context', 'Map ownership, starting points, edit roots, and checks.'],
                [Bot, 'Agents act within scope', 'Provide compact, deterministic context through CLI or MCP.'],
                [GitBranch, 'Knowledge comes back for review', 'Promote durable agent findings as human-owned drafts.'],
              ] as const).map(([Icon, title, copy], index) => (
                <article key={title}>
                  <span className="bridge-flow-number">0{index + 1}</span>
                  <Icon aria-hidden className="bridge-flow-icon" />
                  <div><h3>{title}</h3><p>{copy}</p></div>
                  {index < 3 ? <ArrowRight aria-hidden className="bridge-flow-arrow" /> : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bridge-final-cta">
          <div>
            <p className="bridge-eyebrow">ONE REPOSITORY · TWO AUDIENCES</p>
            <h2>Make your repository clear to the people and agents working in it.</h2>
            <p>Start with the docs you have. Add structure where it gives your team a better handoff.</p>
          </div>
          <Link href="/docs/getting-started" className="bridge-button bridge-button-primary">Add Doc Bridge to your repo <ArrowRight aria-hidden className="size-4" /></Link>
        </section>
        <EcosystemShowcase />
      </main>
      <SiteFooter />
    </div>
  )
}
