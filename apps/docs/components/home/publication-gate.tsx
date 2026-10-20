'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { advisory, agentAnswerFixed, blocked, fixed } from './demo-recordings'
import { FULL, TerminalScript, highlight, highlightCode, useInView, useReducedMotion, useTypedScript, type TermEntry } from './terminal-typing'

const CONFIG: { text: string; gate?: boolean }[] = [
  { text: '{' },
  { text: '  "schemaVersion": 1,' },
  { text: '  "corpus": { "agent": { "root": "docs/guides" } },' },
  { text: '  "gates": {' },
  { text: '    "preset": "minimal",' },
  { text: '    "include": ["reference-findings"],', gate: true },
  { text: '    "referenceFindings": { "base": ".demo/base-snapshot.json" }', gate: true },
  { text: '  }' },
  { text: '}' },
]

type GateState = 'advisory' | 'blocked' | 'passed'

const SCRIPTS: Record<GateState, TermEntry[]> = {
  advisory: [{ command: advisory.index.command, lines: [{ text: advisory.index.output, tone: 'out' }] }],
  blocked: [{ command: blocked.command, lines: blocked.output.split('\n').map((text) => ({ text, tone: text.startsWith('  ') ? 'out' : 'muted' })) }],
  passed: [
    { command: fixed.gate.command, lines: [{ text: fixed.gate.output, tone: 'out' }] },
    { command: fixed.index.command, lines: [{ text: fixed.index.output, tone: 'out' }] },
  ],
}

const STATUS: Record<GateState, { glyph: string; text: string; hint: string }> = {
  advisory: { glyph: '!', text: `Advisory · ${advisory.pendingFindings} pending findings, published anyway`, hint: 'Turn the gate on to block stale docs.' },
  blocked: { glyph: '×', text: 'Failed · publication blocked', hint: 'Apply the one-line fix to the three cited lines.' },
  passed: { glyph: '✓', text: 'Passed · index and llms.txt published', hint: 'The agent now answers with the new signature.' },
}

function AgentAgain() {
  return (
    <div className="bridge-term-entry bridge-gate-agent">
      <p className="bridge-term-line bridge-term-line-muted"># agent, asked again</p>
      <pre>{highlightCode(agentAnswerFixed.code)}</pre>
      <p className="bridge-term-line bridge-term-line-muted">cited {highlight(agentAnswerFixed.citations[1]!)}</p>
    </div>
  )
}

export function PublicationGate() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const [gateOn, setGateOn] = useState(true)
  const [isFixed, setIsFixed] = useState(false)
  const state: GateState = !gateOn ? 'advisory' : isFixed ? 'passed' : 'blocked'
  const entries = useMemo(() => SCRIPTS[state], [state])
  const progress = useTypedScript(entries, state, inView && !reduced)
  const status = STATUS[state]

  return (
    <section id="gate" className="bridge-section" aria-labelledby="gate-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy bridge-section-copy-wide">
          <p className="bridge-eyebrow">OPT-IN GATE</p>
          <h2 id="gate-title">Block publication<br /><span>until it is fixed.</span></h2>
          <p>Turn the gate on and stale docs stop at the door: the index and <code>llms.txt</code> are not rewritten until the cited documentation is fixed. Leave it off and findings stay advisory.</p>
          <Link className="bridge-text-link" href="/docs/guides/publication-gate" prefetch={false}>Read the publication gate guide →</Link>
        </div>

        <div ref={ref} className="bridge-split-card" data-gate={state}>
          <div className="bridge-split-panes">
            <div className="bridge-pane bridge-pane-flush">
              <p className="bridge-pane-title"><span>doc-bridge.config.json</span></p>
              <pre className="bridge-pane-code bridge-config">
                {CONFIG.map((row, index) => (
                  <span key={index} className="bridge-code-row" data-gate-line={row.gate ? (gateOn ? 'on' : 'off') : undefined}>
                    <span className="bridge-guide-number">{index + 1}</span>{highlightCode(row.text)}
                  </span>
                ))}
              </pre>
              <div className="bridge-switch-row">
                <span id="gate-switch-label">Publication gate</span>
                <button type="button" role="switch" aria-checked={gateOn} aria-labelledby="gate-switch-label" className="bridge-switch" onClick={() => { setGateOn((value) => !value); setIsFixed(false) }}>
                  <span>{gateOn ? 'On' : 'Off'}</span><i aria-hidden="true"><b /></i>
                </button>
              </div>
            </div>

            <div className="bridge-pane bridge-pane-flush">
              <div className="bridge-check">
                <span className="bridge-check-badge" aria-hidden="true">{status.glyph}</span>
                <div>
                  <p className="bridge-check-title">CI · ak-docs index</p>
                  <p className="bridge-check-status" role="status">{status.text}</p>
                </div>
              </div>
              <div className="bridge-term-body bridge-gate-terminal bridge-stack">
                {/* All three states, fully printed and invisible, keep the card at the tallest one's height. */}
                {(Object.keys(SCRIPTS) as GateState[]).map((key) => (
                  <div key={key} className="bridge-stack-ghost" aria-hidden="true">
                    <TerminalScript entries={SCRIPTS[key]} progress={FULL} />
                    {key === 'passed' && <AgentAgain />}
                  </div>
                ))}
                <div aria-live="polite">
                  <TerminalScript entries={entries} progress={progress} />
                  {state === 'passed' && progress.done && <AgentAgain />}
                </div>
              </div>
              <div className="bridge-card-actions">
                <span className="bridge-gate-hint">{status.hint}</span>
                <button className="bridge-button bridge-button-primary" type="button" disabled={state !== 'blocked'} onClick={() => setIsFixed(true)}>Fix the doc</button>
                <button className="bridge-button bridge-button-secondary" type="button" onClick={() => { setGateOn(true); setIsFixed(false) }}>Reset demo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
