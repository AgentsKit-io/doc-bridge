import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { isAbsolute, relative } from 'node:path'
import { Box, Text, renderToString } from 'ink'
import { InkThemeProvider, StatusHeader } from '@agentskit/ink'
import { splitLines, toPosix } from '@agentskit/cross-platform'

import type { DoctorReport } from '../../doctor/run-doctor.js'
import type { GateResult, GateRunResult } from '../../gates/run-gates.js'
import type { PendingReferenceFinding } from '../../gates/reference-findings.js'
import type { KnowledgeDiagnostic } from '../../schemas/knowledge.js'
import type { AskResult } from './ask.js'

/** Where relative paths are anchored; defaults to the current directory. */
export type ViewOptions = { readonly root?: string }

const AMBER = 'yellow'

export const relPath = (path: string, root: string = process.cwd()): string => {
  if (!isAbsolute(path)) return toPosix(path)
  const rel = relative(root, path)
  return rel.startsWith('..') || isAbsolute(rel) ? toPosix(path) : toPosix(rel)
}

/** Set inside the interactive app, which draws its own header: views then render only their body. */
export const EmbeddedContext = createContext(false)

/** The status header and spacing every view shares. */
export const Frame = ({ title, children }: { readonly title: string; readonly children?: ReactNode }): ReactElement => {
  const embedded = useContext(EmbeddedContext)
  return (
    <InkThemeProvider>
      <Box flexDirection="column">
        {embedded ? null : <StatusHeader title={title} />}
        <Box flexDirection="column" marginTop={embedded ? 0 : 1}>
          {children}
        </Box>
      </Box>
    </InkThemeProvider>
  )
}

export const Path = ({ path, line }: { readonly path: string; readonly line?: number | undefined }): ReactElement => (
  <Text>
    <Text color="cyan">{path}</Text>
    {line === undefined ? null : <Text dimColor>{`:${line}`}</Text>}
  </Text>
)

/** `color` only when there is one: Ink rejects an explicit `undefined` under exactOptionalPropertyTypes. */
export const tint = (color: string | undefined): { readonly color?: string } => (color === undefined ? {} : { color })

const codeColor = (code: string): string => (code.startsWith('BROKEN') ? 'red' : AMBER)

export const Code = ({ code, width = 0 }: { readonly code: string; readonly width?: number }): ReactElement => (
  <Text color={codeColor(code)} bold>
    {code.padEnd(width)}
  </Text>
)

/** A tool-call style block: ✓/✗, a title, an optional duration, and the detail underneath. */
export const Step = ({ ok, title, durationMs, children }: { readonly ok: boolean; readonly title: string; readonly durationMs?: number | undefined; readonly children?: ReactNode }): ReactElement => (
  <Box flexDirection="column" borderStyle="round" borderColor={ok ? 'green' : 'red'} paddingX={1}>
    <Box>
      <Text color={ok ? 'green' : 'red'} bold>{`${ok ? '✓' : '✗'} ${title}`}</Text>
      <Text dimColor>{`  · ${ok ? 'ok' : 'failed'}${durationMs === undefined ? '' : ` · ${durationMs}ms`}`}</Text>
    </Box>
    {children}
  </Box>
)

export const Hint = ({ children }: { readonly children: ReactNode }): ReactElement => <Text color={AMBER}>{children}</Text>

export const Footer = ({ title, lines }: { readonly title: string; readonly lines: readonly string[] }): ReactElement | null =>
  lines.length === 0 ? null : (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{title}</Text>
      {lines.map((line) => (
        <Text key={line} dimColor>{`  $ ${line}`}</Text>
      ))}
    </Box>
  )

/** `CODE  file:line → target`, one row per pending reference finding. */
export const FindingsTable = ({ findings, limit = 50 }: { readonly findings: readonly PendingReferenceFinding[]; readonly limit?: number }): ReactElement => {
  const shown = findings.slice(0, limit)
  const width = Math.max(0, ...shown.map((finding) => finding.code.length))
  return (
    <Box flexDirection="column">
      {shown.map((finding, position) => (
        <Text key={`${finding.code}:${finding.document}:${finding.line ?? 0}:${finding.target}:${position}`}>
          <Code code={finding.code} width={width} />
          <Text>{'  '}</Text>
          <Path path={finding.document} line={finding.line} />
          <Text dimColor>{' → '}</Text>
          <Text>{finding.target}</Text>
        </Text>
      ))}
      {findings.length > shown.length ? <Text dimColor>{`… and ${findings.length - shown.length} more (see the JSON output)`}</Text> : null}
    </Box>
  )
}

export const PUBLISH_ANYWAY_HINT = 'Fix the cited documentation, or publish anyway with ak-docs index --allow-pending-findings.'

const firstLine = (text: string): string => splitLines(text)[0] ?? ''

/** One gate as a step: the pending findings table and the publish-anyway hint for `reference-findings`. */
export const GateStep = ({ gate }: { readonly gate: GateResult & { readonly durationMs?: number } }): ReactElement => {
  const findings = gate.findings ?? []
  return (
    <Step ok={gate.ok} title={gate.id} durationMs={gate.durationMs}>
      {gate.ok ? (
        <Text color="green">{gate.message}</Text>
      ) : gate.id === 'reference-findings' ? (
        <Box flexDirection="column">
          <Text color="red" bold>{firstLine(gate.message)}</Text>
          {findings.length ? <FindingsTable findings={findings} /> : null}
          {findings.length ? <Hint>{PUBLISH_ANYWAY_HINT}</Hint> : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color="red">{gate.message}</Text>
          {gate.expected ? <Text dimColor>{`expected ${gate.expected}`}</Text> : null}
          {gate.actual ? <Text dimColor>{`actual   ${gate.actual}`}</Text> : null}
        </Box>
      )}
    </Step>
  )
}

// ---- ask --------------------------------------------------------------------------------------

export const AskView = ({ result, root }: { readonly result: AskResult } & ViewOptions): ReactElement => {
  const { best, matches, handoff } = result
  return (
    <Frame title="ak-docs ask">
      <Text>
        <Text dimColor>Question </Text>
        <Text bold>{result.question}</Text>
      </Text>
      <Box marginTop={1}>
        {best ? (
          <Text>
            <Text dimColor>Best match </Text>
            <Text color="green" bold>{`${best.type} ${best.id}`}</Text>
            <Text dimColor>{' ('}</Text>
            <Path path={relPath(best.path, root)} />
            <Text dimColor>{')'}</Text>
          </Text>
        ) : (
          <Text color={AMBER}>Best match: none</Text>
        )}
      </Box>
      {handoff ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Handoff</Text>
          <Text>{`  start:  ${handoff.startHere ?? '(unknown)'}`}</Text>
          <Text>{`  edit:   ${(handoff.editRoots ?? []).join(', ') || '(none)'}`}</Text>
          <Text>{`  checks: ${(handoff.checks ?? []).join(' · ') || '(none)'}`}</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Matches</Text>
        {matches.length ? (
          matches.slice(0, 5).map((match, position) => (
            <Box key={`${match.type}:${match.id}:${position}`} flexDirection="column">
              <Text>
                <Text dimColor>{`  ${match.score.toFixed(2).padStart(6)}  `}</Text>
                <Text bold={match === best}>{`[${match.type}] ${match.id}`}</Text>
              </Text>
              <Text>
                {'          '}
                <Path path={relPath(match.path, root)} />
              </Text>
              {match.summary ? <Text dimColor>{`          ${match.summary.replace(/\s+/g, ' ').slice(0, 100)}`}</Text> : null}
            </Box>
          ))
        ) : (
          <Text color={AMBER}>{'  No local matches. Try: ak-docs search <term>'}</Text>
        )}
      </Box>
      <Footer title="Next commands" lines={result.nextCommands} />
    </Frame>
  )
}

// ---- gate -------------------------------------------------------------------------------------

export const GateView = ({ result }: { readonly result: GateRunResult }): ReactElement => {
  const failing = result.results.filter((gate) => !gate.ok)
  const blocked = failing.some((gate) => gate.id === 'reference-findings')
  return (
    <Frame title="ak-docs gate run">
      <Box flexDirection="column">
        {result.results.map((gate) => (
          <GateStep key={gate.id} gate={gate} />
        ))}
      </Box>
      <Box marginTop={1}>
        {result.ok ? (
          <Text color="green" bold>{`✓ ok · ${result.results.length} gate(s) passing`}</Text>
        ) : (
          <Text color="red" bold>{`${blocked ? 'Publication blocked' : 'Gates failing'} · ${failing.length}/${result.results.length} gate(s) failing`}</Text>
        )}
      </Box>
    </Frame>
  )
}

// ---- index ------------------------------------------------------------------------------------

export type IndexPublished = {
  readonly ok: true
  readonly publication?: { readonly pendingReferenceFindings?: { readonly override: string; readonly reason?: string | undefined; readonly pendingCount?: number | undefined } }
  readonly indexPath: string
  readonly llmsTxtPath?: string
  readonly capabilitiesPath?: string
  readonly contentHash: string
  readonly knowledgeCount: number
  readonly packageCount: number
  readonly handoffCount: number
  readonly diagnostics?: readonly string[]
  readonly nextCommands: readonly string[]
}
export type IndexBlocked = { readonly ok: false; readonly blockedBy: string; readonly gate: GateResult }
export type IndexResult = IndexPublished | IndexBlocked

export const IndexView = ({ result, root }: { readonly result: IndexResult } & ViewOptions): ReactElement => {
  if (!result.ok) {
    return (
      <Frame title="ak-docs index">
        <Text color="red" bold>Publication blocked</Text>
        <GateStep gate={result.gate} />
        <Text dimColor>Nothing was written: the index and llms.txt stay as they were.</Text>
      </Frame>
    )
  }
  const written = [result.indexPath, result.llmsTxtPath, result.capabilitiesPath].filter((path): path is string => Boolean(path))
  const override = result.publication?.pendingReferenceFindings
  return (
    <Frame title="ak-docs index">
      <Text color="green" bold>✓ published</Text>
      {override ? <Hint>{`Published past the reference-findings gate (${override.override}${override.pendingCount === undefined ? '' : `, ${override.pendingCount} pending`}); the index records the override.`}</Hint> : null}
      <Box flexDirection="column" marginTop={1}>
        <Text>{`  ${result.knowledgeCount} documents · ${result.packageCount} packages · ${result.handoffCount} handoffs`}</Text>
        <Text dimColor>{`  hash ${result.contentHash}`}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {written.map((path) => (
          <Text key={path}>
            {'  wrote '}
            <Path path={relPath(path, root)} />
          </Text>
        ))}
      </Box>
      {result.diagnostics?.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Notes</Text>
          {result.diagnostics.map((note) => (
            <Text key={note} color={AMBER}>{`  ! ${note}`}</Text>
          ))}
        </Box>
      ) : null}
      <Footer title="Next commands" lines={result.nextCommands} />
    </Frame>
  )
}

// ---- diff -------------------------------------------------------------------------------------

export type DiffViewResult = { readonly findings: readonly KnowledgeDiagnostic[] }

const documentOf = (finding: KnowledgeDiagnostic): { readonly path: string; readonly line?: number } => {
  const citation = finding.evidence.find((item) => item.source === 'documentation') ?? finding.evidence[0]
  return citation?.path ? { path: citation.path, ...(citation.lineStart === undefined ? {} : { line: citation.lineStart }) } : { path: '(no document)' }
}

export const DiffView = ({ result }: { readonly result: DiffViewResult }): ReactElement => {
  const groups = new Map<string, { readonly finding: KnowledgeDiagnostic; readonly line?: number }[]>()
  for (const finding of result.findings) {
    const { path, line } = documentOf(finding)
    const rows = groups.get(path) ?? []
    rows.push({ finding, ...(line === undefined ? {} : { line }) })
    groups.set(path, rows)
  }
  const width = Math.max(0, ...result.findings.map((finding) => finding.code.length))
  return (
    <Frame title="ak-docs diff">
      {groups.size === 0 ? (
        <Text color="green" bold>✓ ok · no findings</Text>
      ) : (
        [...groups].map(([path, rows]) => (
          <Box key={path} flexDirection="column" marginBottom={1}>
            <Path path={path} />
            {rows.map(({ finding, line }, position) => (
              <Text key={`${finding.id}:${position}`}>
                {'  '}
                <Code code={finding.code} width={width} />
                <Text dimColor>{line === undefined ? '  ' : `  :${line}  `}</Text>
                <Text>{firstLine(finding.message)}</Text>
              </Text>
            ))}
          </Box>
        ))
      )}
      <Text dimColor>{`${result.findings.length} finding(s) in ${groups.size} document(s)`}</Text>
    </Frame>
  )
}

// ---- doctor -----------------------------------------------------------------------------------

export const Bar = ({ pct, width = 20 }: { readonly pct: number; readonly width?: number }): ReactElement => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  const color = pct >= 90 ? 'green' : pct >= 60 ? AMBER : 'red'
  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(width - filled)}</Text>
      <Text>{` ${String(Math.round(pct)).padStart(3)}%`}</Text>
    </Text>
  )
}

const gradeColor = (grade: DoctorReport['grade']): string => (grade === 'A' || grade === 'B' ? 'green' : grade === 'C' ? AMBER : 'red')

export const DoctorView = ({ report }: { readonly report: DoctorReport }): ReactElement => {
  const { coverage } = report
  const pct = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0)
  const rows: readonly (readonly [string, number])[] = [
    ['Reachability', coverage.reachability.pct],
    ['Connectivity', coverage.connectivity.pct],
    ['Handoff-ready', pct(coverage.packages.withAgentDoc, coverage.packages.total)],
    ['Human guides', pct(coverage.packages.withHumanDoc, coverage.packages.total)],
    ['Corpus indexed', pct(coverage.agentDocs.indexed, coverage.agentDocs.total)],
  ]
  const passing = coverage.gates.results.filter((gate) => gate.ok).length
  return (
    <Frame title="ak-docs doctor">
      <Text>
        <Text dimColor>Grade </Text>
        <Text color={gradeColor(report.grade)} bold>{report.grade}</Text>
        <Text dimColor>{`  score ${report.score}/100`}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map(([label, value]) => (
          <Box key={label}>
            <Text>{`  ${label.padEnd(15)}`}</Text>
            <Bar pct={value} />
          </Box>
        ))}
        <Text>{`  ${'Index'.padEnd(15)}${coverage.freshness.ok ? 'fresh' : 'stale or missing'}`}</Text>
        <Text>{`  ${'Gates'.padEnd(15)}${passing}/${coverage.gates.results.length} passing`}</Text>
      </Box>
      {report.grading.unmet.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{`Grade ${report.grade}: an A requires`}</Text>
          {report.grading.unmet.map((reason) => (
            <Text key={reason} color={AMBER}>{`  • ${reason}`}</Text>
          ))}
        </Box>
      ) : null}
      {report.issues.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Issues</Text>
          {report.issues.slice(0, 8).map((issue) => (
            <Text key={`${issue.code}:${issue.message}`} {...tint(issue.severity === 'error' ? 'red' : issue.severity === 'warn' ? AMBER : undefined)}>
              {`  ${issue.severity === 'error' ? '✗' : issue.severity === 'warn' ? '!' : '·'} [${issue.code}] ${issue.message}`}
            </Text>
          ))}
        </Box>
      ) : null}
      <Footer title="Next actions" lines={report.nextActions} />
    </Frame>
  )
}

// ---- vault export -----------------------------------------------------------------------------

export type VaultExportResult = { readonly ok?: boolean; readonly output: string; readonly notes: number; readonly removed: number; readonly findings?: number; readonly warnings?: readonly string[] }

export const VaultExportView = ({ result, root }: { readonly result: VaultExportResult } & ViewOptions): ReactElement => (
  <Frame title="ak-docs vault export">
    <Text color="green" bold>✓ ok · vault exported</Text>
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {'  vault    '}
        <Path path={relPath(result.output, root)} />
      </Text>
      <Text>{`  notes    ${result.notes}`}</Text>
      <Text>{`  removed  ${result.removed}`}</Text>
      {result.findings === undefined ? null : <Text {...tint(result.findings > 0 ? AMBER : undefined)}>{`  findings ${result.findings}`}</Text>}
    </Box>
    {result.warnings?.length ? (
      <Box flexDirection="column" marginTop={1}>
        {result.warnings.map((warning) => (
          <Text key={warning} color={AMBER}>{`  ! ${warning}`}</Text>
        ))}
      </Box>
    ) : null}
  </Frame>
)

// ---- registry and printing --------------------------------------------------------------------

/** One view per command id, taking the result the command already produces. */
export const RICH_VIEWS = {
  ask: (result: AskResult, options: ViewOptions = {}) => <AskView result={result} {...options} />,
  gate: (result: GateRunResult) => <GateView result={result} />,
  index: (result: IndexResult, options: ViewOptions = {}) => <IndexView result={result} {...options} />,
  diff: (result: DiffViewResult) => <DiffView result={result} />,
  doctor: (report: DoctorReport) => <DoctorView report={report} />,
  vault: (result: VaultExportResult, options: ViewOptions = {}) => <VaultExportView result={result} {...options} />,
} as const

export type RichCommand = keyof typeof RICH_VIEWS

/**
 * Renders once into the scrollback at the terminal's width: a static frame, no input, no live
 * region, so nothing is redrawn or duplicated when the process exits.
 */
export const printRich = async (element: ReactElement, options: { readonly stdout?: NodeJS.WriteStream } = {}): Promise<void> => {
  const stdout = options.stdout ?? process.stdout
  stdout.write(`${renderToString(element, { columns: stdout.columns || 100 })}\n`)
}
