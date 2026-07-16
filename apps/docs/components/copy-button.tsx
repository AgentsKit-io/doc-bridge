'use client'

import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'

export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  readonly text: string
  readonly label?: string
  readonly className?: string
}) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }, [text])

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition ${className}`}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

/** Terminal-style code panel with copy for marketing pages (outside MDX). */
export function CopyCode({
  code,
  title = 'bash',
  language = 'bash',
}: {
  readonly code: string
  readonly title?: string
  readonly language?: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b100e] shadow-2xl shadow-emerald-950/20">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-red-400/90" />
          <span className="size-2 rounded-full bg-amber-300/90" />
          <span className="size-2 rounded-full bg-emerald-400/90" />
          <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-white/45">{title}</span>
        </div>
        <CopyButton text={code} className="text-emerald-300/90 hover:bg-white/5 hover:text-emerald-200" />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-7 text-emerald-100/95 sm:text-sm">
        <code data-language={language}>{code}</code>
      </pre>
    </div>
  )
}
