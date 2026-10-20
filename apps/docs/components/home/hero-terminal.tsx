'use client'

import { ask, blocked, driftDiff } from './demo-recordings'
import { TerminalPlayer, type TermFlow, type TermLine } from './terminal-typing'

const askLines: TermLine[] = ask.output.split('\n').slice(1, 6).map((text, index) => ({ text, tone: index === 0 ? 'ok' : 'out' }))
const blockedLines: TermLine[] = blocked.output.split('\n').map((text) => ({ text, tone: text.startsWith('  ') ? 'out' : 'muted' }))

const flows: TermFlow[] = [
  { id: 'ask', label: 'Ask', entries: [{ command: ask.command, lines: askLines }] },
  {
    id: 'change',
    label: 'Change',
    entries: [{
      command: driftDiff.command,
      lines: [
        ...driftDiff.removed.map((text) => ({ text: `-${text}`, tone: 'del' as const })),
        { text: `+${driftDiff.added.at(-1)}`, tone: 'add' as const },
      ],
    }],
  },
  { id: 'gate', label: 'Gate', entries: [{ command: blocked.command, lines: blockedLines }] },
]

export function HeroTerminal() {
  return <TerminalPlayer className="bridge-hero-terminal" title="~/demo-notify — ak-docs" flows={flows} ariaLabel="Recorded ak-docs demo: ask, change the code, publication blocked" minHeight="15.5rem" />
}
