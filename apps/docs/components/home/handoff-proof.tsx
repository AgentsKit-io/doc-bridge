import { ArrowLeft, Bot, BookOpenText, FileCode2, Network, Terminal } from 'lucide-react'

const humanSources = [
  { label: 'Fumadocs', detail: 'Human documentation', Icon: BookOpenText },
  { label: 'Docusaurus', detail: 'Human documentation', Icon: BookOpenText },
  { label: 'Markdown files', detail: 'ADRs · README · guides', Icon: FileCode2 },
] as const

const agentOutputs = [
  { label: 'MCP + CLI', detail: 'One repository-backed handoff', Icon: Terminal },
  { label: 'Agent context', detail: 'startHere · editRoots · checks', Icon: Network },
  { label: 'Memory notes', detail: '.agent-memory → reviewable drafts', Icon: Bot },
] as const

export function HandoffProof() {
  return (
    <figure className="bridge-map" aria-labelledby="handoff-title">
      <figcaption className="bridge-map-heading">
        <span className="bridge-eyebrow">THE DOCUMENTATION BRIDGE</span>
        <span id="handoff-title">One repository. A shared source of truth.</span>
      </figcaption>
      <div className="bridge-map-canvas">
        <svg className="bridge-map-lines" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true">
          <path className="bridge-map-track" d="M245 78 C330 78 354 160 420 160 M245 160 H420 M245 242 C330 242 354 160 420 160" />
          <path className="bridge-map-flow" d="M245 78 C330 78 354 160 420 160 M245 160 H420 M245 242 C330 242 354 160 420 160" />
          <path className="bridge-map-track" d="M580 160 C646 160 670 78 755 78 M580 160 H755 M580 160 C646 160 670 242 755 242" />
          <path className="bridge-map-flow" d="M580 160 C646 160 670 78 755 78 M580 160 H755 M580 160 C646 160 670 242 755 242" />
          <path className="bridge-map-return-track" d="M755 275 C755 304 650 304 500 304 C350 304 245 304 245 275" />
          <path className="bridge-map-return-flow" d="M755 275 C755 304 650 304 500 304 C350 304 245 304 245 275" />
          <circle cx="420" cy="160" r="3" />
          <circle cx="580" cy="160" r="3" />
        </svg>

        <section className="bridge-map-side" aria-label="Human documentation">
          <p className="bridge-map-side-label">FOR PEOPLE</p>
          <ul>
            {humanSources.map(({ label, detail, Icon }) => (
              <li key={label}>
                <Icon aria-hidden />
                <span><strong>{label}</strong><small>{detail}</small></span>
              </li>
            ))}
          </ul>
        </section>

        <div className="bridge-map-core" aria-label="Doc Bridge: index, resolve, and gate repository knowledge">
          <span className="bridge-map-core-mark" aria-hidden>↔</span>
          <strong>Doc Bridge</strong>
          <small>INDEX · RESOLVE · GATE</small>
        </div>

        <section className="bridge-map-side" aria-label="Agent context and tools">
          <p className="bridge-map-side-label">FOR AGENTS</p>
          <ul>
            {agentOutputs.map(({ label, detail, Icon }) => (
              <li key={label}>
                <Icon aria-hidden />
                <span><strong>{label}</strong><small>{detail}</small></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="bridge-map-return">
        <ArrowLeft aria-hidden />
        <span>Agent memory returns to human-owned Markdown for review.</span>
      </div>
    </figure>
  )
}
