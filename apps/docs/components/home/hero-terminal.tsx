'use client'

import { useEffect, useState } from 'react'
import { ask, blocked } from './demo-recordings'

const askPreview = ask.output.split('\n').slice(0, 5).join('\n')
const steps = [
  { command: ask.command, output: askPreview },
  { command: '# @demo/notify changed: send(to, text) → send({ to, text, channel })', output: '' },
  { command: blocked.command, output: blocked.output },
]

export function HeroTerminal() {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setPaused(query.matches); if (query.matches) setStep(steps.length - 1); else setStep(0) }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => setStep((current) => (current + 1) % steps.length), 3600)
    return () => window.clearTimeout(timer)
  }, [paused, step])
  const current = steps[step]!
  return (
    <section className="bridge-proof-terminal bridge-hero-terminal" aria-label="Recorded deterministic CLI demo">
      <header className="bridge-proof-terminal-header">
        <div className="bridge-proof-terminal-controls" aria-hidden="true"><span /><span /><span /></div>
        <span className="bridge-proof-terminal-title">~/demo-notify — ak-docs</span>
        <button type="button" className="bridge-proof-terminal-state" aria-label={paused ? 'Play demo' : 'Pause demo'} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          <i aria-hidden="true" />{paused ? 'Play' : 'Pause'}
        </button>
      </header>
      <div className="bridge-proof-terminal-body" aria-live="polite">
        <div className="bridge-terminal-step" data-active="true">
          <p><span className="bridge-terminal-prompt">$ </span><span className="bridge-terminal-command">{current.command}</span></p>
          {current.output && <pre className="bridge-hero-terminal-output">{current.output}</pre>}
        </div>
      </div>
    </section>
  )
}
