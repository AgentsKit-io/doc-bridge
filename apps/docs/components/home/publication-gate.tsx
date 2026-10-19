'use client'

import { useState } from 'react'
import Link from 'next/link'
import { agentAnswerFixed, blocked, fixed } from './demo-recordings'

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
          <Link className="bridge-text-link" href="/docs/guides/publication-gate" prefetch={false}>Read the publication gate guide →</Link>
        </div>
        <div className="bridge-gate-stack">
          <div className="bridge-card"><header className="bridge-card-header"><span>doc-bridge.config.json</span></header><pre className="bridge-code-view"><code>{config}</code></pre></div>
          <div className="bridge-card">
            <header className="bridge-card-header"><span>Publication gate · ak-docs index</span><span>{isFixed ? 'FIXED' : 'BLOCKED'}</span></header>
            {!isFixed && <div className="bridge-recording" aria-live="polite"><p><span className="bridge-terminal-prompt">$ </span>{blocked.command}</p><pre>{blocked.output}</pre></div>}
            {isFixed && <>
              <div className="bridge-recording" aria-live="polite"><p><span className="bridge-terminal-prompt">$ </span>{fixed.gate.command}</p><pre>{fixed.gate.output}</pre></div>
              <div className="bridge-recording"><p><span className="bridge-terminal-prompt">$ </span>{fixed.index.command}</p><pre>{fixed.index.output}</pre></div>
              <div className="bridge-agent-answer"><p className="bridge-eyebrow">AGENT, ASKED AGAIN · {agentAnswerFixed.model}</p><pre><code>{agentAnswerFixed.code}</code></pre><p>{agentAnswerFixed.note} · {agentAnswerFixed.citations.join(', ')}</p></div>
            </>}
            <footer className="bridge-card-actions"><button className="bridge-button bridge-button-primary" type="button" onClick={() => setIsFixed(true)}>Fix the doc</button><button className="bridge-button bridge-button-secondary" type="button" onClick={() => setIsFixed(false)}>Reset demo</button></footer>
          </div>
        </div>
      </div>
    </section>
  )
}
