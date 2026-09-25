'use client'

import { useEffect, useState } from 'react'
import { CopyButton } from '@/components/copy-button'

const commandText = `npx ak-docs demo --text\n# 60s: handoff · gate red→green · MCP snippet\n\nak-docs index\n\nak-docs query package doc-bridge --agent\n{\n  "startHere": "docs/POSITIONING.md",\n  "editRoots": ["src"],\n  "checks": ["pnpm test", "pnpm typecheck"]\n}\n\nbackend calls: 0`
const steps = ['Demo', 'Index', 'Resolve'] as const

export function ProofTerminal({ sourceCount }: { sourceCount: number }) {
  const [activeStep, setActiveStep] = useState(0)
  const [manualPaused, setManualPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(true)
  const paused = manualPaused || hovered || focusWithin || reducedMotion

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => setActiveStep((current) => (current + 1) % steps.length), 4300)
    return () => window.clearTimeout(timer)
  }, [activeStep, paused])

  return (
    <section
      className="bridge-proof-terminal"
      data-paused={paused}
      data-active-step={steps[activeStep].toLowerCase()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false)
      }}
      aria-label="Animated Doc Bridge CLI demo"
    >
      <header className="bridge-proof-terminal-header">
        <div className="bridge-proof-terminal-controls" aria-hidden="true"><span /><span /><span /></div>
        <span className="bridge-proof-terminal-title">Deterministic handoff</span>
        {reducedMotion ? (
          <span className="bridge-proof-terminal-state">Manual</span>
        ) : (
          <button
            type="button"
            className="bridge-proof-terminal-state"
            onClick={() => setManualPaused((current) => !current)}
            aria-label={manualPaused ? 'Play terminal demo' : 'Pause terminal demo'}
          >
            <i aria-hidden="true" />{paused ? 'Paused' : 'Playing'}
          </button>
        )}
      </header>

      <div id="bridge-terminal-output" className="bridge-proof-terminal-body" aria-hidden="true">
        <div className="bridge-terminal-step" data-active={activeStep === 0}>
          <p><span className="bridge-terminal-prompt">$ </span><span className="bridge-terminal-command">npx ak-docs demo --text</span></p>
          <p className="bridge-terminal-muted"># 60s: handoff · gate red→green · MCP snippet</p>
        </div>
        {activeStep >= 1 && (
          <div className="bridge-terminal-step" data-active={activeStep === 1}>
            <p><span className="bridge-terminal-prompt">$ </span><span className="bridge-terminal-command">ak-docs index</span></p>
            <p className="bridge-terminal-output">✓ {sourceCount} knowledge sources indexed</p>
          </div>
        )}
        {activeStep >= 2 && (
          <div className="bridge-terminal-step" data-active={activeStep === 2}>
            <p><span className="bridge-terminal-prompt">$ </span><span className="bridge-terminal-command">ak-docs query package doc-bridge --agent</span></p>
            <p>{'{'}</p>
            <p>  <span className="bridge-terminal-key">"startHere"</span>: <span className="bridge-terminal-string">"docs/POSITIONING.md"</span>,</p>
            <p>  <span className="bridge-terminal-key">"editRoots"</span>: [<span className="bridge-terminal-string">"src"</span>],</p>
            <p>  <span className="bridge-terminal-key">"checks"</span>: [<span className="bridge-terminal-string">"pnpm test"</span>, <span className="bridge-terminal-string">"pnpm typecheck"</span>]</p>
            <p>{'}'}</p>
            <p className="bridge-terminal-muted">backend calls: 0</p>
          </div>
        )}
      </div>
      <div className="sr-only">{commandText.replaceAll('\n', ' ')}</div>
      <div className="bridge-proof-terminal-footer">
        <div className="bridge-terminal-tabs" role="tablist" aria-label="CLI demo stages">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              role="tab"
              aria-selected={index === activeStep}
              aria-controls="bridge-terminal-output"
              tabIndex={index === activeStep ? 0 : -1}
              onClick={() => setActiveStep(index)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                event.preventDefault()
                const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length
                setActiveStep(next)
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
              }}
            >
              {step}
            </button>
          ))}
        </div>
        <CopyButton text={commandText} className="bridge-terminal-copy text-emerald-300/90 hover:bg-white/5 hover:text-emerald-200" />
      </div>
    </section>
  )
}
