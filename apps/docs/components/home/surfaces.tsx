import Link from 'next/link'
import { Code2, FileText, GitPullRequest, SquareTerminal, type LucideIcon } from 'lucide-react'
import { BrandMark, TOOLS } from './brand-mark'

type FlowNode = { title: string; detail: string; icon?: LucideIcon; brands?: { label: string; slug?: string }[] }

const inputs: FlowNode[] = [
  { title: 'Docs', detail: 'Markdown · Fumadocs · Docusaurus', brands: [TOOLS.markdown, TOOLS.fumadocs, TOOLS.docusaurus] },
  { title: 'Code', detail: 'Symbols the docs reference', icon: Code2 },
]
const outputs: FlowNode[] = [
  { title: 'ak-docs CLI', detail: 'ask · search · gate', icon: SquareTerminal },
  { title: 'MCP server', detail: 'Claude Code · Codex · Cursor', brands: [TOOLS.mcp, TOOLS.claudeCode, TOOLS.codex, TOOLS.cursor] },
  { title: 'llms.txt', detail: 'published with the index', icon: FileText },
  { title: 'PR comment', detail: 'advisory findings', icon: GitPullRequest },
]

function Node({ node }: { node: FlowNode }) {
  const Icon = node.icon
  return (
    <div className="bridge-flow-node">
      <strong>
        {Icon && <Icon aria-hidden className="bridge-flow-node-icon" />}
        {node.title}
        {node.brands && <span className="bridge-flow-brands">{node.brands.map((brand) => <BrandMark key={brand.label} slug={brand.slug} label={brand.label} size={14} />)}</span>}
      </strong>
      <span>{node.detail}</span>
    </div>
  )
}

// Connector geometry in a 100 × 300 box: inputs sit at 1/4 and 3/4 of the height, outputs at 1/8, 3/8, 5/8, 7/8.
const IN_Y = [75, 225]
const OUT_Y = [37.5, 112.5, 187.5, 262.5]
const curve = (from: number, to: number) => `M0 ${from} C 55 ${from}, 45 ${to}, 100 ${to}`

function Connectors({ paths }: { paths: string[] }) {
  return (
    <div className="bridge-flow-link" aria-hidden="true">
      <svg className="bridge-flow-svg" viewBox="0 0 100 300" preserveAspectRatio="none">
        {paths.map((d) => <path key={`base-${d}`} d={d} className="bridge-flow-base" vectorEffect="non-scaling-stroke" />)}
        {paths.map((d, index) => <path key={`dash-${d}`} d={d} className="bridge-flow-dash" style={{ animationDelay: `${index * -0.3}s` }} vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
  )
}

export function Surfaces() {
  return (
    <section id="surfaces" className="bridge-section" aria-labelledby="surfaces-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy bridge-section-copy-wide">
          <p className="bridge-eyebrow">SURFACES</p>
          <h2 id="surfaces-title">One index.<br /><span>Every surface.</span></h2>
        </div>

        <div className="bridge-flow" role="img" aria-label="Docs and code flow into one deterministic index, which feeds the ak-docs CLI, the MCP server, llms.txt and a pull request advisory comment; agent notes flow back as a reviewable docs draft.">
          <div className="bridge-flow-column bridge-flow-inputs">
            {inputs.map((node) => <Node key={node.title} node={node} />)}
          </div>
          <Connectors paths={IN_Y.map((y) => curve(y, 150))} />
          <div className="bridge-flow-core">
            <span className="bridge-flow-core-glow" aria-hidden="true" />
            <p className="bridge-eyebrow">LAYER 0</p>
            <strong>Deterministic index</strong>
            <span>No model, no API key. Same docs, same index, every run.</span>
          </div>
          <Connectors paths={OUT_Y.map((y) => curve(150, y))} />
          <div className="bridge-flow-column bridge-flow-outputs">
            {outputs.map((node) => <Node key={node.title} node={node} />)}
          </div>
        </div>

        <div className="bridge-flow-return">
          <svg viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true" className="bridge-flow-return-line">
            <path d="M100 1 L0 1" className="bridge-flow-base" vectorEffect="non-scaling-stroke" />
            <path d="M100 1 L0 1" className="bridge-flow-dash bridge-flow-dash-muted" vectorEffect="non-scaling-stroke" />
          </svg>
          <p>Agent notes come back as a <Link href="/docs/guides/memory-pipeline" prefetch={false} className="bridge-inline-link">reviewable docs draft</Link>, never a silent edit.</p>
        </div>
      </div>
    </section>
  )
}
