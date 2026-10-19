'use client'

import { useState } from 'react'
import { agentAnswerStale, drift, guideAfter, guideBefore } from './demo-recordings'

export function DriftFindings() {
  const [changed, setChanged] = useState(false)
  return (
    <section id="finding" className="bridge-section bridge-section-ruled" aria-labelledby="finding-title">
      <div className="bridge-section-inner bridge-section-split">
        <div className="bridge-section-copy">
          <p className="bridge-eyebrow">DRIFT FINDINGS</p>
          <h2 id="finding-title">Change the code.<br />See which doc is wrong.</h2>
          <p>doc-bridge records what each doc references. When the code behind a reference changes, you get a finding that points at the exact line, before an agent repeats it.</p>
        </div>
        <div className="bridge-card bridge-drift-card">
          <header className="bridge-card-header"><button type="button" className="bridge-toggle" aria-pressed={changed} onClick={() => setChanged((value) => !value)}>@demo/notify · send()</button><span>{changed ? 'CHANGED' : 'BEFORE'}</span></header>
          <pre className="bridge-code-view" aria-live="polite"><code>{changed ? drift.after : drift.before}</code></pre>
          {changed && <div className="bridge-finding-details" aria-live="polite">
            <p>The guides still teach <code>send(to, text)</code>. Nobody updated them.</p>
            <p className="bridge-finding-label">CHANGED_REFERENCE <code>docs/guides/sending-notifications.md:8 → send</code></p>
            <p className="bridge-eyebrow">STALE GUIDE</p><pre className="bridge-code-view"><code>{guideBefore}</code></pre>
            <p className="bridge-eyebrow">ONE-LINE FIX</p><pre className="bridge-code-view"><code>{guideAfter}</code></pre>
            <p>Also flagged: <code>testing.md:8</code>, <code>getting-started.md:9</code></p>
            <details><summary>What the agent answered</summary><p className="bridge-model-label">{agentAnswerStale.model}, asked after the change, without doc-bridge&apos;s findings</p><pre className="bridge-code-view"><code>{agentAnswerStale.code}</code></pre><p>{agentAnswerStale.note} · {agentAnswerStale.citations[0]}</p><p>Confident, and wrong for the new API: it followed the stale guide.</p></details>
          </div>}
        </div>
      </div>
    </section>
  )
}
