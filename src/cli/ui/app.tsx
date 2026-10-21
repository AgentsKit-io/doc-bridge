import { useState, type ReactElement } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { InkThemeProvider, StatusHeader } from '@agentskit/ink'

import type { DocBridgeConfigV1 } from '../../config/schema.js'
import type { DoctorReport } from '../../doctor/run-doctor.js'
import type { GateResult } from '../../gates/run-gates.js'
import type { AskResult } from './ask.js'
import {
  AskView,
  Code,
  DoctorView,
  EmbeddedContext,
  FindingsTable,
  GateStep,
  Hint,
  IndexView,
  PUBLISH_ANYWAY_HINT,
  Path,
  tint,
  type IndexResult,
} from './render.js'
import { createServices, type DocumentContext, type Freshness, type UiServices } from './services.js'

export const TABS = ['Ask', 'Findings', 'Publish', 'Doctor'] as const
type Tab = (typeof TABS)[number]

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

type Loaded<T> = { readonly value?: T; readonly error?: string }

const attempt = <T,>(run: () => T): Loaded<T> => {
  try {
    return { value: run() }
  } catch (error) {
    return { error: message(error) }
  }
}

const Tabs = ({ active }: { readonly active: Tab }): ReactElement => (
  <Box>
    {TABS.map((tab) => (
      <Box key={tab} marginRight={2}>
        <Text {...tint(tab === active ? 'cyan' : undefined)} bold={tab === active} dimColor={tab !== active} inverse={tab === active}>{` ${tab} `}</Text>
      </Box>
    ))}
  </Box>
)

const ErrorLine = ({ error }: { readonly error: string }): ReactElement => <Text color="red">{`✗ ${error}`}</Text>

const ContextView = ({ context, document, line }: { readonly context: DocumentContext | undefined; readonly document: string; readonly line: number | undefined }): ReactElement => (
  <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
    <Path path={document} line={line} />
    {context ? (
      context.lines.map((text, offset) => {
        const number = context.start + offset
        const focus = number === context.focus
        return (
          <Text key={number} {...tint(focus ? 'yellow' : undefined)} dimColor={!focus} bold={focus}>
            {`${focus ? '▸' : ' '} ${String(number).padStart(4)}  ${text}`}
          </Text>
        )
      })
    ) : (
      <Text color="yellow">The document could not be read.</Text>
    )}
  </Box>
)

const FindingsTab = ({ gate, error, selected, detail, services }: { readonly gate: GateResult | undefined; readonly error: string | undefined; readonly selected: number; readonly detail: boolean; readonly services: UiServices }): ReactElement => {
  if (error) return <ErrorLine error={error} />
  if (!gate) return <Text dimColor>Running the reference-findings gate…</Text>
  const findings = gate.findings ?? []
  if (gate.ok) return <Text color="green" bold>{`✓ ok · ${gate.message}`}</Text>
  if (findings.length === 0) return <GateStep gate={gate} />
  const chosen = findings[Math.min(selected, findings.length - 1)]
  return (
    <Box flexDirection="column">
      <Text color="red" bold>{`${findings.length} pending reference finding(s)`}</Text>
      {findings.slice(0, 50).map((finding, position) => (
        <Text key={`${finding.code}:${finding.document}:${finding.line ?? 0}:${finding.target}:${position}`} inverse={position === selected}>
          {position === selected ? '❯ ' : '  '}
          <Code code={finding.code} />
          <Text>{` ${finding.document}${finding.line === undefined ? '' : `:${finding.line}`} → ${finding.target}`}</Text>
        </Text>
      ))}
      {detail && chosen ? <ContextView context={services.context(chosen.document, chosen.line)} document={chosen.document} line={chosen.line} /> : null}
    </Box>
  )
}

const PublishTab = ({ gate, result, error, confirming }: { readonly gate: GateResult | undefined; readonly result: IndexResult | undefined; readonly error: string | undefined; readonly confirming: boolean }): ReactElement => (
  <Box flexDirection="column">
    {gate ? <GateStep gate={gate} /> : <Text dimColor>No publication gate is configured; the index is written without one.</Text>}
    {gate && !gate.ok && (gate.findings ?? []).length ? <FindingsTable findings={gate.findings ?? []} limit={10} /> : null}
    {error ? <ErrorLine error={error} /> : null}
    {confirming ? <Hint>{`Publish past the gate (--allow-pending-findings)? The index records the override. y to confirm, any other key cancels.`}</Hint> : null}
    {result ? (
      <Box marginTop={1}>
        <IndexView result={result} />
      </Box>
    ) : null}
    {!result && gate && !gate.ok ? <Text dimColor>{PUBLISH_ANYWAY_HINT}</Text> : null}
  </Box>
)

export type UiAppProps = { readonly services: UiServices }

/** The interactive app: sections on ←/→, Enter to act, `q` to quit. */
export const UiApp = ({ services }: UiAppProps): ReactElement => {
  const { exit } = useApp()
  const [tab, setTab] = useState<Tab>('Ask')
  const [mode, setMode] = useState<'nav' | 'input' | 'confirm'>('nav')
  const [freshness, setFreshness] = useState<Freshness | undefined>(() => attempt(services.freshness).value)

  const [question, setQuestion] = useState('')
  const [ask, setAsk] = useState<Loaded<AskResult>>({})
  const [findings, setFindings] = useState<Loaded<GateResult>>({})
  const [findingsLoaded, setFindingsLoaded] = useState(false)
  const [selected, setSelected] = useState(0)
  const [detail, setDetail] = useState(false)
  const [publishGate, setPublishGate] = useState<{ readonly gate: GateResult | undefined; readonly error?: string } | undefined>()
  const [published, setPublished] = useState<Loaded<IndexResult>>({})
  const [doctor, setDoctor] = useState<Loaded<DoctorReport>>({})
  const [doctorLoaded, setDoctorLoaded] = useState(false)

  const loadFindings = (): void => {
    setFindings(attempt(services.findings))
    setFindingsLoaded(true)
    setSelected(0)
    setDetail(false)
  }
  const loadPublish = (): void => {
    const loaded = attempt(services.publicationGate)
    setPublishGate({ gate: loaded.value, ...(loaded.error ? { error: loaded.error } : {}) })
  }
  const loadDoctor = (): void => {
    setDoctor(attempt(services.doctor))
    setDoctorLoaded(true)
  }
  const goto = (next: Tab): void => {
    setTab(next)
    if (next === 'Findings' && !findingsLoaded) loadFindings()
    if (next === 'Publish' && !publishGate) loadPublish()
    if (next === 'Doctor' && !doctorLoaded) loadDoctor()
  }
  const publish = (allowPendingFindings: boolean): void => {
    setPublished(attempt(() => services.publish({ allowPendingFindings })))
    setFreshness(attempt(services.freshness).value)
    loadPublish()
  }

  useInput((input, key) => {
    if (mode === 'input') {
      if (key.escape) setMode('nav')
      else if (key.return) {
        const asked = question.trim()
        setMode('nav')
        if (asked) setAsk(attempt(() => services.ask(asked)))
      } else if (key.backspace || key.delete) setQuestion((text) => text.slice(0, -1))
      else if (input && !key.ctrl && !key.meta) setQuestion((text) => `${text}${input}`)
      return
    }
    if (mode === 'confirm') {
      setMode('nav')
      if (input === 'y') publish(true)
      return
    }
    if (input === 'q') {
      exit()
      return
    }
    const position = TABS.indexOf(tab)
    if (key.leftArrow) goto(TABS[(position + TABS.length - 1) % TABS.length] as Tab)
    else if (key.rightArrow) goto(TABS[(position + 1) % TABS.length] as Tab)
    else if (tab === 'Ask' && key.return) setMode('input')
    else if (tab === 'Findings') {
      const count = findings.value?.findings?.length ?? 0
      if (key.upArrow) setSelected((value) => Math.max(0, value - 1))
      else if (key.downArrow) setSelected((value) => Math.min(Math.max(0, count - 1), value + 1))
      else if (key.return && count > 0) setDetail((value) => !value)
      else if (input === 'r') loadFindings()
    } else if (tab === 'Publish') {
      if (input === 'p') publish(false)
      else if (input === 'P') setMode('confirm')
    } else if (tab === 'Doctor' && input === 'r') loadDoctor()
  })

  const hints =
    mode === 'input' ? 'type a question · Enter ask · Esc cancel'
    : mode === 'confirm' ? 'y publish anyway · any key cancels'
    : tab === 'Ask' ? '←/→ section · Enter ask · q quit'
    : tab === 'Findings' ? '←/→ section · ↑/↓ select · Enter context · r rerun · q quit'
    : tab === 'Publish' ? '←/→ section · p publish · P publish anyway · q quit'
    : '←/→ section · r rerun · q quit'

  return (
    <InkThemeProvider>
      <EmbeddedContext.Provider value>
        <Box flexDirection="column">
          <StatusHeader title="ak-docs ui" />
          <Box marginTop={1}>
            <Tabs active={tab} />
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {tab === 'Ask' ? (
              <Box flexDirection="column">
                <Text>
                  <Text {...tint(mode === 'input' ? 'cyan' : undefined)} bold>{'❯ '}</Text>
                  <Text>{question}</Text>
                  {mode === 'input' ? <Text inverse> </Text> : question ? null : <Text dimColor>Press Enter, then type a question about this repository</Text>}
                </Text>
                {ask.error ? <ErrorLine error={ask.error} /> : null}
                {ask.value ? <AskView result={ask.value} /> : null}
              </Box>
            ) : null}
            {tab === 'Findings' ? <FindingsTab gate={findings.value} error={findings.error} selected={selected} detail={detail} services={services} /> : null}
            {tab === 'Publish' ? <PublishTab gate={publishGate?.gate} result={published.value} error={published.error ?? publishGate?.error} confirming={mode === 'confirm'} /> : null}
            {tab === 'Doctor' ? (doctor.error ? <ErrorLine error={doctor.error} /> : doctor.value ? <DoctorView report={doctor.value} /> : <Text dimColor>Loading…</Text>) : null}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{`${services.name} · index ${freshness ?? 'unknown'} · ${hints}`}</Text>
          </Box>
        </Box>
      </EmbeddedContext.Provider>
    </InkThemeProvider>
  )
}

/** `ak-docs ui`: the full-screen app over the library functions. Resolves when the user quits. */
export const runUi = async ({ root, config }: { readonly root: string; readonly config: DocBridgeConfigV1 }): Promise<void> => {
  const instance = render(<UiApp services={createServices({ root, config })} />, { alternateScreen: true, exitOnCtrlC: true })
  await instance.waitUntilExit()
}
