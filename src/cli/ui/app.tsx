import React from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { DocBridgeConfigV1 } from '../../config/schema.js'
import { loadFreshDocBridgeIndex } from '../../query/load-index.js'
import { searchIndex } from '../../query/search.js'
import { runGate, runGates, publicationDecision } from '../../gates/run-gates.js'
import { runDoctor } from '../../doctor/run-doctor.js'
import { buildDocBridgeIndex } from '../../index-builder/build-index.js'
import { discoverRepository } from '../../discovery/repository.js'
import { checkReferenceFindings } from '../../gates/reference-findings.js'
import { AskView, DoctorView, GateView, IndexView } from './render.js'

const TABS = ['Ask', 'Findings', 'Publish', 'Doctor'] as const
type Tab = typeof TABS[number]

export type UiOptions = { root: string; config: DocBridgeConfigV1 }

function App({ root, config }: UiOptions) {
  const { exit } = useApp()
  const [tab, setTab] = React.useState<Tab>('Ask')
  const [question, setQuestion] = React.useState('')
  const [ask, setAsk] = React.useState<ReturnType<typeof makeAsk> | undefined>()
  const [findings, setFindings] = React.useState<ReturnType<typeof runGate> | undefined>(() => { try { return runGate(root, config, 'reference-findings') } catch { return undefined } })
  const [doctor, setDoctor] = React.useState<ReturnType<typeof runDoctor> | undefined>(() => { try { return runDoctor(root, config) } catch { return undefined } })
  const [indexResult, setIndexResult] = React.useState<any>()
  const [selected, setSelected] = React.useState(0)
  const [docLines, setDocLines] = React.useState<string[] | undefined>()
  const [confirm, setConfirm] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const repo = relative(process.cwd(), root) || '.'


  const submitAsk = () => {
    const query = question.trim()
    if (!query) return
    const index = loadFreshDocBridgeIndex(root, config)
    setAsk(makeAsk(query, searchIndex(index, query, 8)))
    setQuestion('')
  }
  const publish = (allowPendingFindings: boolean) => {
    const decision = publicationDecision(root, config, { allowPendingFindings })
    if (!decision.allowed) { setIndexResult({ ok: false, blockedBy: decision.gate.id, gate: decision.gate }); return }
    const built = buildDocBridgeIndex({ root, config, ...(decision.publication ? { publication: decision.publication } : {}) })
    setIndexResult({ ok: true, indexPath: relative(root, built.indexPath), knowledgeCount: built.index.knowledge.length, packageCount: built.index.lookup?.packages.length ?? 0, handoffCount: Object.keys(built.index.handoffs ?? {}).length })
    setNotice('Index published.')
  }
  useInput((input, key) => {
    if (input === 'q') { exit(); return }
    if (key.leftArrow) { setTab(TABS[(TABS.indexOf(tab) + TABS.length - 1) % TABS.length]!); setDocLines(undefined); return }
    if (key.rightArrow) { setTab(TABS[(TABS.indexOf(tab) + 1) % TABS.length]!); setDocLines(undefined); return }
    if (tab === 'Ask') {
      if (key.return) { submitAsk(); return }
      if (key.backspace || key.delete) { setQuestion(question.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setQuestion(question + input)
    } else if (tab === 'Findings') {
      const list = findings?.findings ?? []
      if (key.upArrow) setSelected(Math.max(0, selected - 1))
      if (key.downArrow) setSelected(Math.min(Math.max(0, list.length - 1), selected + 1))
      if (key.return && list[selected]) {
        const f = list[selected]!
        try { const body = readFileSync(resolve(root, f.document), 'utf8').split(/\r?\n/); const at = Math.max(0, (f.line ?? 1) - 1); setDocLines(body.slice(Math.max(0, at - 3), at + 4).map((line, i) => `${Math.max(0, at - 3) + i + 1}: ${line}`)) } catch { setDocLines(['Unable to read document.']) }
      }
    } else if (tab === 'Publish') {
      if (input === 'p') publish(false)
      if (input === 'P') setConfirm(true)
      if (key.return && confirm) { setConfirm(false); publish(true) }
      if (input === 'n' || key.escape) setConfirm(false)
    }
  })

  const gateRun = findings ? { ok: findings.ok, results: [findings] } : undefined
  return <Box flexDirection="column" padding={1}>
    <Text bold color="cyan">ak-docs · {repo}</Text>
    <Text dimColor>Index freshness: {doctor?.coverage.freshness.message ?? 'checking'} · ←/→ sections · Enter select · q quit</Text>
    <Box marginY={1}>{TABS.map(name => <Text key={name} {...(name === tab ? { color: 'cyan' as const } : {})} bold={name === tab}>{name === tab ? ` ${name} ` : `  ${name}  `}</Text>)}</Box>
    {tab === 'Ask' && <Box flexDirection="column"><Text>Question: <Text color="cyan">{question}▌</Text></Text>{ask && <AskView result={ask} />}</Box>}
    {tab === 'Findings' && <Box flexDirection="column"><Text bold>Reference findings</Text>{gateRun && <GateView result={gateRun} />}{findings?.findings?.map((f, i) => <Text key={i} {...(i === selected ? { color: 'cyan' as const } : {})}>{i === selected ? '› ' : '  '}{f.code} {f.document}{f.line ? `:${f.line}` : ''} → {f.target}</Text>)}{docLines && <Box flexDirection="column" marginTop={1}>{docLines.map((line: string, i: number) => <Text key={i}>{line}</Text>)}</Box>}</Box>}
    {tab === 'Publish' && <Box flexDirection="column"><Text>p publish · P publish anyway</Text>{confirm && <Text color="yellow">Publish with pending findings? Press Enter to confirm or Esc to cancel.</Text>}{indexResult && <IndexView result={indexResult} />}{notice && <Text color="green">{notice}</Text>}</Box>}
    {tab === 'Doctor' && (doctor ? <DoctorView result={doctor} /> : <Text>Doctor report unavailable.</Text>)}
    <Text dimColor>Ask · Findings · Publish · Doctor</Text>
  </Box>
}

function makeAsk(question: string, matches: ReturnType<typeof searchIndex>) {
  return { question, matches, ...(matches[0] ? { best: matches[0] } : {}), nextCommands: ['ak-docs doctor --text', 'ak-docs gate run'] }
}

export const runUi = ({ root, config }: UiOptions): void => {
  render(<App root={root} config={config} />)
}
