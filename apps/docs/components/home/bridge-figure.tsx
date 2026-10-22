'use client'

import { useEffect, useRef, useState } from 'react'
import { BASE_PATH } from '@/lib/site'

const FIGURE_SRC = `${BASE_PATH}/figures/bridge-conveyor.html`
const FALLBACK_LIGHT = `${BASE_PATH}/figures/bridge-conveyor-fallback-light.png`
const FALLBACK_DARK = `${BASE_PATH}/figures/bridge-conveyor-fallback-dark.png`
const PHONE_QUERY = '(max-width: 640px)'

export function BridgeFigure() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string | undefined>(undefined)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    // Phones get the whole bridge as a still image; the interactive figure needs a wider screen.
    const phone = window.matchMedia(PHONE_QUERY)
    const load = () => { if (!phone.matches) setSrc(FIGURE_SRC) }
    if (!('IntersectionObserver' in window)) { load(); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !phone.matches) { load(); observer.disconnect() }
    }, { rootMargin: '300px 0px' })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  return (
    <figure className="bridge-figure">
      <div className="bridge-figure-stage">
        <iframe ref={frameRef} className="bridge-figure-frame" src={src} title="Interactive isometric illustration of documentation and code moving through doc-bridge to produce cited context and drift findings." loading="lazy" />
        {/* The site theme (not the OS preference) picks the still image, so both are rendered and CSS shows one. */}
        <div className="bridge-figure-fallback">
          <img className="bridge-figure-static bridge-figure-static-light" src={FALLBACK_LIGHT} alt="Isometric illustration of documentation and code moving through doc-bridge to produce cited context and drift findings." width={2552} height={1234} loading="lazy" decoding="async" />
          <img className="bridge-figure-static bridge-figure-static-dark" src={FALLBACK_DARK} alt="Isometric illustration of documentation and code moving through doc-bridge to produce cited context and drift findings." width={2552} height={1234} loading="lazy" decoding="async" />
        </div>
      </div>
    </figure>
  )
}
