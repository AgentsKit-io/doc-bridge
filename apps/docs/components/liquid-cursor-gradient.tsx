'use client'

import { useEffect, useRef } from 'react'

export function LiquidCursorGradient() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reducedMotion.matches) return
      element.style.setProperty('--cursor-x', `${event.clientX}px`)
      element.style.setProperty('--cursor-y', `${event.clientY}px`)
      element.dataset.active = 'true'
    }
    const leave = () => { element.dataset.active = 'false' }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
    }
  }, [])

  return <div ref={ref} className="bridge-liquid-cursor" aria-hidden="true"><i /><i /></div>
}
