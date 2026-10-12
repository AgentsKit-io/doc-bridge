'use client'

import { useEffect, useRef } from 'react'

const MIN_HEIGHT = 200
const MAX_HEIGHT = 1200

export function AssemblyFigureSection() {
  const frameRef = useRef<HTMLIFrameElement>(null)

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
          <p>Code and documents enter the index. A sensor compares a changed signature with the documents that claim it, and the stamp prints an advisory comment for the reviewer.</p>
        </div>
        <figure className="bridge-assembly-figure">
          <div className="bridge-assembly-stage">
            <iframe
              ref={frameRef}
              className="bridge-assembly-frame"
              src="/figures/assembly-line.html"
              title="Interactive isometric figure of the doc-bridge assembly line: toggle a changed parse() signature and watch the sensor flag the document that claims the old signature, then the stamp prints an advisory comment."
              loading="lazy"
            />
            {/* Without JavaScript the iframe cannot run its figure: show the static capture instead. Dark is the site default. */}
            <noscript>
              <style>{'.bridge-assembly-frame { display: none; }'}</style>
              <img
                className="bridge-assembly-static"
                src="/figures/assembly-line-fallback-dark.png"
                alt="Static view of the doc-bridge assembly line in its unchanged state: code and documents on a conveyor, a loom weaving the index, a sensor gate, a stamp and a doc shelf."
                width={1096}
                height={892}
              />
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
