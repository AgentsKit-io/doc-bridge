'use client'

import { lazy, Suspense, useState } from 'react'
import { MessageCircle } from 'lucide-react'

const loadWidget = () => import('./chat-widget')
const ChatWidget = lazy(loadWidget)

export function ChatLauncher() {
  const [open, setOpen] = useState(false)
  if (open) return <Suspense fallback={<p className="fixed bottom-4 right-4 z-50 rounded-full bg-[#111714] px-5 py-3 text-sm text-white">Opening chat…</p>}><ChatWidget onClose={() => setOpen(false)} /></Suspense>
  return <button type="button" className="fixed bottom-4 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111714] px-5 py-3 text-sm font-semibold text-white shadow-xl transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-white dark:text-black" aria-label="Ask Doc Bridge" onPointerEnter={() => { void loadWidget() }} onFocus={() => { void loadWidget() }} onClick={() => setOpen(true)}><MessageCircle className="size-4" />Ask Doc Bridge</button>
}
