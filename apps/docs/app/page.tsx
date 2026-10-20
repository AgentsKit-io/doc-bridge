import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { HeroTerminal } from '@/components/home/hero-terminal'
import { InstallCommandTabs } from '@/components/home/install-command-tabs'
import { BridgeFigure } from '@/components/home/bridge-figure'
import { BrandMark, TOOLS } from '@/components/home/brand-mark'
import { CitedAnswers } from '@/components/home/cited-answers'
import { DriftFindings } from '@/components/home/drift-findings'
import { PublicationGate } from '@/components/home/publication-gate'
import { Surfaces } from '@/components/home/surfaces'
import { Measured } from '@/components/home/measured'
import { EcosystemShowcase } from '@/components/ecosystem'
import { ProductSubheader } from '@/components/product-subheader'
import { SiteFooter } from '@/components/site-footer'
import './home.css'

export default function HomePage() {
  return (
    <div className="bridge-home">
      <agentskit-aurora aria-hidden="true" />
      <ProductSubheader />
      <main className="bridge-home-content">
        <section className="bridge-home-hero">
          <div className="bridge-home-hero-inner">
            <div className="bridge-hero-copy">
              <p className="bridge-eyebrow"><span className="bridge-eyebrow-line" />DETERMINISTIC · CITED · DRIFT-AWARE</p>
              <h1>Docs your team reads.<br /><span>Context your agents can cite.</span></h1>
              <p className="bridge-hero-description">doc-bridge indexes your repository&apos;s docs, hands agents answers with <code>path:line</code> citations over CLI and MCP, and flags the doc the moment the code moves away from it.</p>
              <div className="bridge-hero-actions">
                <Link href="/docs/getting-started" prefetch={false} className="bridge-button bridge-button-primary">Add to your repo <ArrowRight aria-hidden className="size-4" /></Link>
                <a href="#finding" className="bridge-button bridge-button-secondary">See a finding</a>
              </div>
            </div>
            <HeroTerminal />
            <div className="bridge-install">
              <span className="bridge-eyebrow">ADD TO YOUR REPOSITORY</span>
              <InstallCommandTabs />
            </div>
          </div>
        </section>

        <section id="how" className="bridge-how" aria-labelledby="how-title">
          <div className="bridge-how-inner">
            <div className="bridge-section-heading">
              <p className="bridge-eyebrow">HOW IT WORKS</p>
              <h2 id="how-title">Loose docs in.<br />Cited context out.</h2>
            </div>
            <BridgeFigure />
            <div className="bridge-works-with" aria-label="Works with">
              <span className="bridge-eyebrow">WORKS WITH</span>
              <ul>{Object.values(TOOLS).map((tool) => <li key={tool.label}><BrandMark slug={'slug' in tool ? tool.slug : undefined} label={tool.label} />{tool.label}</li>)}</ul>
            </div>
          </div>
        </section>
        <CitedAnswers />
        <DriftFindings />
        <PublicationGate />
        <Surfaces />
        <Measured />
        <section className="bridge-final-cta">
          <div>
            <h2>Give your agents the line.<br />Catch the doc before they read it.</h2>
          </div>
          <div className="bridge-hero-actions">
            <Link href="/docs/getting-started" prefetch={false} className="bridge-button bridge-button-primary">Add to your repo <ArrowRight aria-hidden className="size-4" /></Link>
            <Link href="/docs" prefetch={false} className="bridge-button bridge-button-secondary">Read the docs</Link>
          </div>
        </section>
        <EcosystemShowcase />
      </main>
      <SiteFooter />
    </div>
  )
}
