'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// Typed-terminal engine shared by the landing demos. It follows the AgentsKit home CLI showcase:
// the command is typed, output lines arrive one by one, the frame holds, then the next flow plays.
// Every command and output comes from demo-recordings.ts; this file only animates and highlights.

export type TermTone = 'out' | 'ok' | 'muted' | 'warn' | 'error' | 'add' | 'del'
export type TermLine = { text: string; tone?: TermTone }
export type TermEntry = { command: string; lines: TermLine[] }

const TYPE_MS = 24
const HOLD_MS = 3000

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Defer nonessential demos until the page is loaded and the browser is idle. */
export function useAfterLoad(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let idleId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const schedule = () => {
      if (cancelled) return
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => setReady(true))
      } else {
        timer = setTimeout(() => setReady(true), 1200)
      }
    }
    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])
  return ready
}

export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (!('IntersectionObserver' in window)) { setInView(true); return }
    // Tracks entering and leaving, so a demo replays from the start each time it scrolls back into view.
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1)
      if (entry) setInView(entry.isIntersecting)
    }, { threshold: 0.45 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

type Progress = { entry: number; typed: number; lines: number; done: boolean }

/** A script printed in full: every command typed and every line shown. */
export const FULL: Progress = { entry: Infinity, typed: Infinity, lines: Infinity, done: true }

/**
 * Plays `entries` once per `runKey`: types each command, then reveals its lines.
 * When `animate` is false the whole script is shown at once (paused or reduced motion).
 */
export function useTypedScript(entries: TermEntry[], runKey: string, animate: boolean, onDone?: () => void): Progress {
  const full: Progress = { entry: entries.length - 1, typed: Infinity, lines: Infinity, done: true }
  const [progress, setProgress] = useState<Progress>(full)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!animate) { setProgress(full); return }
    const timers: ReturnType<typeof setTimeout>[] = []
    let elapsed = 0
    const at = (ms: number, next: Progress) => { elapsed += ms; timers.push(setTimeout(() => setProgress(next), elapsed)) }
    setProgress({ entry: 0, typed: 0, lines: 0, done: false })
    entries.forEach((entry, index) => {
      for (let typed = 1; typed <= entry.command.length; typed += 1) at(TYPE_MS, { entry: index, typed, lines: 0, done: false })
      const stagger = entry.lines.length > 6 ? 110 : 320
      entry.lines.forEach((_, line) => at(line === 0 ? 260 : stagger, { entry: index, typed: Infinity, lines: line + 1, done: false }))
      if (index < entries.length - 1) at(700, { entry: index + 1, typed: 0, lines: 0, done: false })
    })
    at(200, full)
    timers.push(setTimeout(() => doneRef.current?.(), elapsed + HOLD_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runKey identifies the script
  }, [runKey, animate])

  return progress
}

// Output tokens, in priority order: inline code (also when the CLI cut it mid-span), quoted strings,
// file paths with an optional line, finding codes and verdicts, entity tags, scores and flags.
const TOKEN = /(`[^`]*`?|"[^"]*"|(?:docs|packages)\/[\w./-]+(?::\d+)?|[\w-]+\.md:\d+|CHANGED_REFERENCE|Publication blocked:|Best match:|Question:|Matches:|Next commands:|ok=true|ok=false|gate=0 pending|\[knowledge\]|score=[\d.]+|--[\w-]+)/g

function tokenKind(part: string): string {
  if (part.startsWith('`')) return 'code'
  if (part.startsWith('"')) return 'string'
  if (part.startsWith('--') || part === '[knowledge]') return 'key'
  if (part.startsWith('score=')) return 'muted'
  if (part === 'CHANGED_REFERENCE') return 'warn'
  if (part === 'Publication blocked:' || part === 'ok=false') return 'error'
  if (part === 'Best match:' || part === 'ok=true' || part === 'gate=0 pending') return 'ok'
  if (part === 'Question:' || part === 'Matches:' || part === 'Next commands:') return 'label'
  return 'path'
}

export function highlight(text: string): ReactNode {
  return text.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part ? <Fragment key={index}>{part}</Fragment> : null
    return <span key={index} className={`bridge-term-${tokenKind(part)}`}>{part}</span>
  })
}

/** A typed command: the program name stands out, then strings, flags and paths as in output. */
export function highlightCommand(command: string): ReactNode {
  const space = command.indexOf(' ')
  const program = space === -1 ? command : command.slice(0, space)
  return <><span className="bridge-term-program">{program}</span>{space === -1 ? null : highlight(command.slice(space))}</>
}

const KEYWORDS = /\b(import|from|await|export|async|function|interface|type|const)\b/
const CODE_TOKEN = /("[^"]*"|\b(?:import|from|await|export|async|function|interface|type|const)\b)/g

/** Minimal TypeScript colouring for the short snippets on the page. */
export function highlightCode(code: string): ReactNode {
  return code.split(CODE_TOKEN).map((part, index) => {
    if (!part) return null
    if (part.startsWith('"')) return <span key={index} className="bridge-terminal-string">{part}</span>
    if (KEYWORDS.test(part) && index % 2 === 1) return <span key={index} className="bridge-terminal-key">{part}</span>
    return <Fragment key={index}>{part}</Fragment>
  })
}

export function TerminalScript({ entries, progress }: { entries: TermEntry[]; progress: Progress }) {
  return (
    <>
      {entries.slice(0, progress.entry + 1).map((entry, index) => {
        const current = index === progress.entry
        const command = current ? entry.command.slice(0, progress.typed) : entry.command
        const typing = current && !progress.done && progress.typed < entry.command.length
        const lines = current ? entry.lines.slice(0, progress.lines) : entry.lines
        return (
          <div className="bridge-term-entry" key={`${index}-${entry.command}`}>
            <p className="bridge-term-command"><span className="bridge-terminal-prompt">$ </span>{highlightCommand(command)}{typing && <span className="bridge-term-cursor" aria-hidden="true" />}</p>
            {lines.map((line, lineIndex) => (
              <p key={lineIndex} className={`bridge-term-line bridge-term-line-${line.tone ?? 'out'}`}>{highlight(line.text)}</p>
            ))}
          </div>
        )
      })}
    </>
  )
}

export type TermFlow = { id: string; label: string; entries: TermEntry[] }

/** A terminal card that cycles through flows, with tabs and Pause / Play like the AgentsKit home. */
export function TerminalPlayer({ title, flows, ariaLabel, className, minHeight, loop = true }: {
  title: string
  flows: TermFlow[]
  ariaLabel: string
  className?: string
  minHeight?: string
  loop?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const afterLoad = useAfterLoad()
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [round, setRound] = useState(0)
  const flow = flows[active]!
  const animate = afterLoad && inView && playing && !reduced
  const progress = useTypedScript(flow.entries, `${flow.id}:${round}`, animate, () => {
    if (flows.length > 1) setActive((current) => (current + 1) % flows.length)
    else if (loop) setRound((current) => current + 1)
  })

  return (
    <section ref={ref} className={`bridge-proof-terminal ${className ?? ''}`} aria-label={ariaLabel} data-paused={!playing || reduced}>
      <header className="bridge-proof-terminal-header">
        <div className="bridge-proof-terminal-controls" aria-hidden="true"><span /><span /><span /></div>
        <span className="bridge-proof-terminal-title">{title}</span>
        {!reduced && (
          <button type="button" className="bridge-proof-terminal-state" aria-label={playing ? 'Pause demo' : 'Play demo'} onClick={() => setPlaying((value) => !value)}>
            <i aria-hidden="true" />{playing ? 'Pause' : 'Play'}
          </button>
        )}
      </header>
      {flows.length > 1 && (
        <div className="bridge-terminal-tabs bridge-term-tabs" role="tablist" aria-label="Demo step">
          {flows.map((item, index) => (
            <button key={item.id} type="button" role="tab" aria-selected={index === active} onClick={() => { setActive(index); setPlaying(false) }}>{item.label}</button>
          ))}
        </div>
      )}
      <div className="bridge-term-body bridge-stack" style={minHeight ? { minHeight } : undefined}>
        {/* Every flow, fully printed and invisible, reserves the height of the tallest one. */}
        {flows.map((item) => <div key={item.id} className="bridge-stack-ghost" aria-hidden="true"><TerminalScript entries={item.entries} progress={FULL} /></div>)}
        <div aria-live="polite"><TerminalScript entries={flow.entries} progress={progress} /></div>
      </div>
    </section>
  )
}
