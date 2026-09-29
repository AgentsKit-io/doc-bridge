'use client'

import { useState, type KeyboardEvent } from 'react'
import { CopyButton } from '@/components/copy-button'

const managers = [
  ['npm', 'npm install -D @agentskit/doc-bridge'],
  ['pnpm', 'pnpm add -D @agentskit/doc-bridge'],
  ['yarn', 'yarn add -D @agentskit/doc-bridge'],
  ['bun', 'bun add -d @agentskit/doc-bridge'],
] as const

export function InstallCommandTabs() {
  const [active, setActive] = useState(0)
  const command = managers[active][1]

  const selectWithArrows = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const next = (active + direction + managers.length) % managers.length
    setActive(next)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="min-w-0">
      <div className="bridge-install-tabs" role="tablist" aria-label="Package manager" onKeyDown={selectWithArrows}>
        {managers.map(([name], index) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`install-tab-${name}`}
            aria-selected={active === index}
            aria-controls="install-command-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
          >
            {name}
          </button>
        ))}
      </div>
      <div id="install-command-panel" role="tabpanel" aria-labelledby={`install-tab-${managers[active][0]}`} className="flex min-w-0 items-center gap-2 rounded-b-xl border border-t-0 border-white/10 bg-[#0b100e] px-3 py-1">
        <span aria-hidden className="font-mono text-sm text-emerald-400">$</span>
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-2 font-mono text-xs leading-6 text-emerald-50">{command}</code>
        <CopyButton text={command} className="text-emerald-300/90 hover:bg-white/5 hover:text-emerald-200" />
      </div>
    </div>
  )
}
