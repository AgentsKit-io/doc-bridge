'use client'

import { useState } from 'react'
import { agentAnswerFixed, fixed, gateBlocked } from './demo-recordings'

const config = `{
  "schemaVersion": 1,
  "corpus": { "agent": { "root": "docs/guides" } },
  "gates": {
    "preset": "minimal",
    "include": ["reference-findings"],
    "referenceFindings": { "base": ".demo/base-snapshot.json" }
  }
}`

export function PublicationGate() {
  const [isFixed, setIsFixed] = useState(false)
  return (
    <section id="gate" className="bridge-section bridge-section-ruled" aria-labelledby="gate-title">
      <div className="bridge-section-inner bridge-section-split">
        <div className="bridge-section-copy">
          <p className="bridge-eyebrow">OPT-IN GATE</p>
          <h2 id="gate-title">Block publication<br />until it is fixed.</h2>
          <p>Turn the gate on and stale docs stop at the door: the index and <code>llms.txt</code> are not rewritten until the cited documentation is fixed. Leave it off and findings stay advisory.</p>
          <a className="bridge-text-link" href="/docs/guides/publication-gate">Read the publication gate guide →</a>
        </div>
        <div className="bridge-gate-stack">
          <div className="bridge-card"><header className="bridge-card-header"><span>ak-docs.config.json</span></header><pre className="bridge-code-view"><code>{config}</code></pre></div>
          <div className="bridge-card">
            <header className="bridge-card-header"><span>Publication gate · ak-docs index</span><span>{isFixed ? 'FIXED' : 'BLOCKED'}</span></header>
            <div className="bridge-recording" aria-live="polite"><p><span className="bridge-terminal-prompt">$ </span>{isFixed ? fixed.index.command : fixed.gate.command}</p><pre>{isFixed ? `${fixed.index.output}\n${fixed.gate.output}` : gateBlocked.output}</pre></div>
            {isFixed && <div className="bridge-agent-answer"><p className="bridge-eyebrow">AGENT ANSWER · {agentAnswerFixed.model}</p><p><span className="bridge-terminal-prompt">$ </span>ak-docs ask "How do I send a notification?" --agent</p><pre><code>{agentAnswerFixed.code}</code></pre><p>{agentAnswerFixed.note} · {agentAnswerFixed.citations.join(', ')}</p></div>}
            <footer className="bridge-card-actions"><button className="bridge-button bridge-button-primary" type="button" onClick={() => setIsFixed(true)}>Fix the doc</button><button className="bridge-button bridge-button-secondary" type="button" onClick={() => setIsFixed(false)}>Reset demo</button></footer>
          </div>
        </div>
      </div>
    </section>
  )
}
