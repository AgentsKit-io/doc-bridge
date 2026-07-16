'use client'

import { useEffect, useId, useState } from 'react'

/** Client-side Mermaid for product docs (static export safe). */
export function Mermaid({ chart }: { readonly chart: string }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        })
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart)
        if (!cancelled) setSvg(rendered)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Mermaid render failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-xl border border-red-500/30 bg-black/40 p-4 text-xs text-red-200">
        {chart}
      </pre>
    )
  }
  if (!svg) {
    return <p className="text-sm text-neutral-500">Loading diagram…</p>
  }
  return (
    <div
      className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1117] p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
