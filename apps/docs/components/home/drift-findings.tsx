'use client'

import { useEffect, useRef, useState } from 'react'
import { agentAnswerStale, driftDiff, guideAfter, guideLines, toLines } from './demo-recordings'
import { highlight, highlightCode, useInView, useReducedMotion } from './terminal-typing'

const STEPS = [
  { id: 'before', label: 'Before', hold: 2600 },
  { id: 'changed', label: 'Code changed', hold: 2600 },
  { id: 'finding', label: 'Finding', hold: 4200 },
  { id: 'fixed', label: 'Fixed', hold: 3600 },
] as const

const FINDING = 'CHANGED_REFERENCE docs/guides/sending-notifications.md:8 → send'
const fixedCall = toLines(guideAfter).slice(2)
// Lines 14–16 sit inside the guide's ```ts fence; the rest is prose and stays uncoloured.
const CODE_LINES = new Set([14, 15, 16])

function CodeView({ changed }: { changed: boolean }) {
  return (
    <>
      <pre className="bridge-pane-code">
        {!changed && <span className="bridge-code-row">{highlightCode(driftDiff.removed[0]!)}</span>}
        {changed && (
          <>
            <span className="bridge-code-row bridge-code-del">-{driftDiff.removed[0]}</span>
            {driftDiff.added.map((text, index) => (
              <span key={text + index} className="bridge-code-row bridge-code-add" style={{ animationDelay: `${index * 90}ms` }}>+{text}</span>
            ))}
          </>
        )}
      </pre>
      <p className="bridge-pane-note">{changed ? 'send() now takes one object with a channel.' : 'The guides teach this signature.'}</p>
    </>
  )
}

function GuideView({ step, live = false }: { step: number; live?: boolean }) {
  const changed = step >= 1
  const flagged = step === 2
  const fixed = step === 3
  const role = live ? 'status' : undefined
  return (
    <div className="bridge-guide">
      {guideLines.map(({ line, text }) => {
        const isCall = line === 16
        const state = line === 8 && flagged ? 'flagged' : isCall && fixed ? 'fixed' : isCall && changed && !fixed ? 'stale' : undefined
        return (
          <div key={line} className="bridge-guide-row" data-state={state}>
            <span className="bridge-guide-number">{line}</span>
            <code>{isCall && fixed ? <span className="bridge-guide-fix">{fixedCall.map((row) => <span key={row}>{highlightCode(row)}</span>)}</span> : CODE_LINES.has(line) ? highlightCode(text) : text}</code>
          </div>
        )
      })}
      {flagged && <p className="bridge-finding-chip" role={role}><span className="bridge-pulse" aria-hidden="true" />{highlight(FINDING)}</p>}
      {fixed && <p className="bridge-finding-chip bridge-finding-chip-ok" role={role}>✓ guide teaches send({'{'} to, text, channel {'}'}) · finding resolved</p>}
    </div>
  )
}

export function DriftFindings() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const animate = inView && playing && !reduced

  useEffect(() => { if (reduced) setStep(2) }, [reduced])
  useEffect(() => {
    if (!animate) return
    const timer = setTimeout(() => setStep((current) => (current + 1) % STEPS.length), STEPS[step]!.hold)
    return () => clearTimeout(timer)
  }, [animate, step])

  const changed = step >= 1
  const select = (index: number) => { setStep(index); setPlaying(false) }

  return (
    <section id="finding" className="bridge-section" aria-labelledby="finding-title">
      <div className="bridge-section-inner">
        <div className="bridge-section-copy bridge-section-copy-wide">
          <p className="bridge-eyebrow">DRIFT FINDINGS</p>
          <h2 id="finding-title">Change the code.<br /><span>See which doc is wrong.</span></h2>
          <p>doc-bridge records what each doc references. When the code behind a reference changes, you get a finding that points at the exact line, before an agent repeats it.</p>
        </div>

        <div ref={ref} className="bridge-split-card" data-step={STEPS[step]!.id}>
          <div className="bridge-split-toolbar">
            <div className="bridge-terminal-tabs" role="tablist" aria-label="Drift demo step">
              {STEPS.map((item, index) => (
                <button key={item.id} type="button" role="tab" aria-selected={index === step} onClick={() => select(index)}>{item.label}</button>
              ))}
            </div>
            {!reduced && (
              <button type="button" className="bridge-proof-terminal-state" aria-label={playing ? 'Pause demo' : 'Play demo'} onClick={() => setPlaying((value) => !value)}>
                <i aria-hidden="true" />{playing ? 'Pause' : 'Play'}
              </button>
            )}
          </div>

          <div className="bridge-split-panes">
            <div className="bridge-pane">
              <p className="bridge-pane-title"><span>{driftDiff.command.replace('git diff -U0 -- ', '')}</span></p>
              {/* The tallest state is laid out invisibly under the live one, so the card never changes height. */}
              <div className="bridge-stack">
                <div className="bridge-stack-ghost" aria-hidden="true"><CodeView changed /></div>
                <div aria-live="polite"><CodeView changed={changed} /></div>
              </div>
            </div>

            <div className="bridge-pane">
              <p className="bridge-pane-title"><span>docs/guides/sending-notifications.md</span></p>
              <div className="bridge-stack">
                <div className="bridge-stack-ghost" aria-hidden="true"><GuideView step={2} /></div>
                <div className="bridge-stack-ghost" aria-hidden="true"><GuideView step={3} /></div>
                <div aria-live="polite"><GuideView step={step} live /></div>
              </div>
            </div>
          </div>

          <div className="bridge-split-footer">
            <p>Also flagged: {highlight('docs/guides/testing.md:8')} · {highlight('docs/guides/getting-started.md:9')}</p>
            <details className="bridge-agent-details">
              <summary>What the agent answered before the fix</summary>
              <p className="bridge-model-label">Asked after the change, without doc-bridge&apos;s findings</p>
              <pre><code>{highlightCode(agentAnswerStale.code)}</code></pre>
              <p>{highlight(agentAnswerStale.note)} · cited {highlight(agentAnswerStale.citations[0]!)}. Confident, and wrong for the new API: it followed the stale guide.</p>
            </details>
          </div>
        </div>
      </div>
    </section>
  )
}
