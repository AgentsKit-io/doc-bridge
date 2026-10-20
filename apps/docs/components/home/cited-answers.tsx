'use client'

import { useRef, useState } from 'react'
import { ask, agentAnswerFixed } from './demo-recordings'
import { FULL, TerminalScript, highlight, highlightCode, useInView, useReducedMotion, useTypedScript, type TermLine } from './terminal-typing'

const lines: TermLine[] = ask.output.split('\n').map((text) => ({
  text,
  tone: text.startsWith('Best match:') ? 'ok' : text.startsWith('Next commands:') || text.startsWith('ak-docs ') ? 'muted' : 'out',
}))
const entries = [{ command: ask.command, lines }]

export function CitedAnswers() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const [playing, setPlaying] = useState(true)
  const [round, setRound] = useState(0)
  const animate = inView && playing && !reduced
  // Types the query, shows the agent's answer, holds, then plays again while the card stays in view.
  const progress = useTypedScript(entries, `ask:${round}`, animate, () => setRound((value) => value + 1))
  const showAnswer = !animate || progress.done

  return (
    <section id="ask" className="bridge-section" aria-labelledby="ask-title">
      <div className="bridge-section-inner bridge-section-split">
        <div className="bridge-section-copy">
          <p className="bridge-eyebrow">CITED ANSWERS</p>
          <h2 id="ask-title">Ask the repository.<br /><span>Get the line.</span></h2>
          <p>Agents query the same docs your team reads, from the terminal or over MCP. Every answer names the file and line it came from, so you can check it in one click.</p>
          <p className="bridge-stat"><strong>88.3%</strong><span>hit@3 on the retrieval benchmark</span></p>
        </div>
        <div ref={ref} className="bridge-proof-terminal bridge-answer-card" data-paused={!playing || reduced}>
          <header className="bridge-proof-terminal-header">
            <div className="bridge-proof-terminal-controls" aria-hidden="true"><span /><span /><span /></div>
            <span className="bridge-proof-terminal-title">~/demo-notify — ak-docs</span>
            {reduced ? <span aria-hidden="true" /> : (
              <button type="button" className="bridge-proof-terminal-state" aria-label={playing ? 'Pause demo' : 'Play demo'} onClick={() => setPlaying((value) => !value)}>
                <i aria-hidden="true" />{playing ? 'Pause' : 'Play'}
              </button>
            )}
          </header>
          <div className="bridge-term-body bridge-stack">
            <div className="bridge-stack-ghost" aria-hidden="true"><TerminalScript entries={entries} progress={FULL} /></div>
            <div aria-live="polite"><TerminalScript entries={entries} progress={progress} /></div>
          </div>
          <div className="bridge-agent-answer" data-visible={showAnswer}>
            <p className="bridge-eyebrow">AGENT ANSWER</p>
            <pre><code>{highlightCode(agentAnswerFixed.code)}</code></pre>
            <p>{highlight(agentAnswerFixed.note)} · cited <span className="bridge-term-path bridge-citation">{agentAnswerFixed.citations[0]}</span></p>
          </div>
        </div>
      </div>
    </section>
  )
}
