'use client'

import { useEffect, useRef, useState } from 'react'
import { BASE_PATH } from '@/lib/site'

const FIGURE_SRC = `${BASE_PATH}/figures/bridge-conveyor.html`
const FALLBACK_LIGHT = `${BASE_PATH}/figures/bridge-conveyor-fallback-light.png`
const FALLBACK_DARK = `${BASE_PATH}/figures/bridge-conveyor-fallback-dark.png`

export function BridgeFigure() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string | undefined>(undefined)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    if (!('IntersectionObserver' in window)) { setSrc(FIGURE_SRC); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSrc(FIGURE_SRC); observer.disconnect() }
    }, { rootMargin: '300px 0px' })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  return (
    <figure className="bridge-figure">
      <div className="bridge-figure-stage">
        <iframe ref={frameRef} className="bridge-figure-frame" src={src} title="Interactive isometric illustration of documentation and code moving through doc-bridge to produce cited context and drift findings." loading="lazy" />
        <noscript>
          <style>{'.bridge-figure-frame { display: none; }'}</style>
          <picture>
            <source srcSet={FALLBACK_LIGHT} media="(prefers-color-scheme: light)" />
            <img className="bridge-figure-static" src={FALLBACK_DARK} alt="Isometric illustration of documentation and code moving through doc-bridge to produce cited context and drift findings." width={1644} height={592} />
          </picture>
        </noscript>
      </div>
    </figure>
  )
}
