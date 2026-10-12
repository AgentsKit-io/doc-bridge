'use client'

import { useEffect, useRef, useState } from 'react'
import { BASE_PATH } from '@/lib/site'

const MIN_HEIGHT = 200
const MAX_HEIGHT = 1600
const FIGURE_SRC = `${BASE_PATH}/figures/assembly-line.html`
const FALLBACK_LIGHT = `${BASE_PATH}/figures/assembly-line-fallback-light.png`
const FALLBACK_DARK = `${BASE_PATH}/figures/assembly-line-fallback-dark.png`

export function AssemblyFigureSection() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  // The figure runs its own animation; load it only when the section nears the viewport, so it does
  // not compete with the hero during the first paint (native lazy loading starts it far too early).
  const [src, setSrc] = useState<string | undefined>(undefined)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    if (!('IntersectionObserver' in window)) {
      setSrc(FIGURE_SRC)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSrc(FIGURE_SRC)
          observer.disconnect()
        }
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // The figure reports its card height so the frame fits the content at every width.
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current
      if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; height?: unknown } | null
      if (!data || data.type !== 'doc-bridge-assembly-height' || typeof data.height !== 'number') return
      const height = Math.min(Math.max(Math.ceil(data.height), MIN_HEIGHT), MAX_HEIGHT)
      frame.style.height = `${height}px`
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <section id="assembly-figure" className="bridge-assembly" aria-labelledby="assembly-figure-title">
      <div className="bridge-assembly-inner">
        <div className="bridge-section-heading">
          <p className="bridge-eyebrow">THE ASSEMBLY LINE</p>
          <h2 id="assembly-figure-title">Change a signature. Watch the doc that claims it get flagged.</h2>
          <p>Code files and markdown documents ride one conveyor. A loom weaves them into the deterministic index, a sensor gate compares each document&apos;s claim with the woven code, and a stamp prints the advisory comment for the reviewer.</p>
        </div>
        <figure className="bridge-assembly-figure">
          <div className="bridge-assembly-stage">
            <iframe
              ref={frameRef}
              className="bridge-assembly-frame"
              src={src}
              title="Interactive isometric figure of the doc-bridge assembly line: change the parse() signature and watch the changed file travel through the loom, the sensor gate flag the document that claims the old signature, and the stamp print an advisory slip."
              loading="lazy"
            />
            {/* Without JavaScript the iframe cannot run its figure: show a static capture of it instead. */}
            <noscript>
              <style>{'.bridge-assembly-frame { display: none; }'}</style>
              <picture>
                <source srcSet={FALLBACK_LIGHT} media="(prefers-color-scheme: light)" />
                <img
                  className="bridge-assembly-static"
                  src={FALLBACK_DARK}
                  alt="Static view of the doc-bridge assembly line: an intake tunnel feeds code files and documents onto one conveyor, a loom weaves them into an index sheet that winds onto a spool, a sensor gate with a lamp reads each document against the index, and a stamp with a slip printer marks flagged documents."
                  width={1608}
                  height={654}
                />
              </picture>
            </noscript>
          </div>
          <figcaption className="bridge-assembly-caption">
            An illustrative model of the deterministic pipeline, not a benchmark. Its readout is computed from its own small model. The published results below come from the repository reports.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
