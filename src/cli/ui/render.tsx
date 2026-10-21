import React from 'react'
import { render, Box, Text } from 'ink'
import type { SearchMatch } from '../../query/search.js'
import type { GateRunResult } from '../../gates/run-gates.js'
import type { PendingReferenceFinding } from '../../gates/reference-findings.js'
import type { DoctorReport } from '../../doctor/run-doctor.js'

const Path = ({ children }: { children: string }) => <Text color="cyan">{children}</Text>
const Good = ({ children }: { children: React.ReactNode }) => <Text color="green">{children}</Text>
const Bad = ({ children }: { children: React.ReactNode }) => <Text color="red">{children}</Text>

export type AskResult = { question: string; matches: SearchMatch[]; best?: SearchMatch; nextCommands?: string[] }
export function AskView({ result }: { result: AskResult }) {
  const best = result.best ?? result.matches[0]
  return <Box flexDirection="column">
    <Text bold color="cyan">Documentation search</Text>
    <Text>Question: <Text bold>{result.question}</Text></Text>
    <Text>Best match: {best ? <><Text bold>{best.type} {best.id}</Text> <Path>{best.path}</Path></> : 'none'}</Text>
    <Text bold>Matches</Text>
    {result.matches.length ? result.matches.map((match, i) => <Text key={`${match.id}-${i}`}>  {i === 0 ? '★' : '·'} {match.type} {match.id} <Path>{match.path}</Path> <Text dimColor>{match.score.toFixed(3)}</Text></Text>) : <Text dimColor>No local matches.</Text>}
    <Box marginTop={1} flexDirection="column"><Text bold>Next commands</Text>{(result.nextCommands ?? ['ak-docs list knowledge --text', 'ak-docs doctor --text']).map(command => <Text key={command} dimColor>{`  ${command}`}</Text>)}</Box>
  </Box>
}

export function GateView({ result }: { result: GateRunResult }) {
  const findings = result.results.flatMap(g => g.findings ?? [])
  return <Box flexDirection="column">
    <Text bold color="cyan">Publication gates</Text>
    {result.results.map(g => <Text key={g.id}>{g.ok ? <Good>✓</Good> : <Bad>✗</Bad>} {g.id}: {g.message}</Text>)}
    {findings.length > 0 && <Box flexDirection="column" marginTop={1}><Text bold>Pending reference findings</Text><Text dimColor>CODE  document:line → target</Text>{findings.map((f, i) => <FindingRow key={`${f.document}-${i}`} finding={f} />)}</Box>}
    {!result.ok && <Text color="yellow">Use --allow-pending-findings to publish anyway.</Text>}
  </Box>
}

function FindingRow({ finding }: { finding: PendingReferenceFinding }) {
  return <Text>{`${finding.code}  ${finding.document}${finding.line === undefined ? '' : `:${finding.line}`} → ${finding.target}`}</Text>
}

export type IndexResult = { ok: boolean; blockedBy?: string; gate?: { message?: string }; indexPath?: string; llmsTxtPath?: string; knowledgeCount?: number; packageCount?: number; handoffCount?: number; diagnostics?: Array<{ code?: string; message?: string; path?: string }> }
export function IndexView({ result }: { result: IndexResult }) {
  return <Box flexDirection="column"><Text bold color="cyan">Index publication</Text>
    {result.ok ? <Good>Published</Good> : <Bad>Publication blocked</Bad>}
    {!result.ok && <Text>{result.gate?.message ?? result.blockedBy}</Text>}
    {result.ok && <><Text>{result.knowledgeCount ?? 0} documents · {result.packageCount ?? 0} packages · {result.handoffCount ?? 0} handoffs</Text>{result.indexPath && <Text>Index: <Path>{result.indexPath}</Path></Text>}{result.llmsTxtPath && <Text>llms.txt: <Path>{result.llmsTxtPath}</Path></Text>}</>}
    {result.diagnostics?.map((d, i) => <Text key={i} color="yellow">Note: {d.code ?? ''} {d.message ?? ''} {d.path ? <Path>{d.path}</Path> : null}</Text>)}
  </Box>
}

export type DiffResult = { findings?: Array<{ code: string; document?: string; path?: string; message?: string; line?: number }> }
export function DiffView({ result }: { result: DiffResult }) {
  const grouped = new Map<string, NonNullable<DiffResult['findings']>>()
  for (const item of result.findings ?? []) { const key = item.document ?? item.path ?? '(unknown document)'; grouped.set(key, [...(grouped.get(key) ?? []), item]) }
  return <Box flexDirection="column"><Text bold color="cyan">Documentation changes</Text>{[...grouped].map(([doc, items]) => <Box key={doc} flexDirection="column"><Text bold><Path>{doc}</Path></Text>{items.map((f, i) => <Text key={i}>  <Text color={f.code === 'CHANGED_REFERENCE' ? 'yellow' : 'red'}>{f.code}</Text> {f.line ? `line ${f.line} ` : ''}{f.message ?? ''}</Text>)}</Box>)}{grouped.size === 0 && <Good>No findings.</Good>}</Box>
}

export function DoctorView({ result }: { result: DoctorReport }) {
  const bar = (value: number) => `${'█'.repeat(Math.max(0, Math.min(20, Math.round(value / 5))))}${'░'.repeat(20 - Math.max(0, Math.min(20, Math.round(value / 5))))}`
  const cov = result.coverage
  return <Box flexDirection="column"><Text bold color="cyan">Documentation health</Text><Text>Grade <Text bold color={result.grade === 'A' ? 'green' : 'yellow'}>{result.grade}</Text> · {result.score}/100</Text>
    <Text>Reachability <Text color="cyan">{bar(cov.reachability.pct)}</Text> {cov.reachability.pct}%</Text><Text>Connectivity <Text color="cyan">{bar(cov.connectivity.pct)}</Text> {cov.connectivity.pct}%</Text>
    {result.grading.unmet.map(item => <Text key={item} color="yellow">Unmet: {item}</Text>)}{result.issues.map((issue, i) => <Text key={i} color={issue.severity === 'error' ? 'red' : 'yellow'}>{issue.severity}: {issue.message}</Text>)}</Box>
}

export type VaultExportResult = { notes: number; removed: number; findings?: number; warnings?: string[] }
export function VaultExportView({ result }: { result: VaultExportResult }) { return <Box flexDirection="column"><Text bold color="cyan">Vault export</Text><Text><Good>{`${result.notes} notes`}</Good> · {result.removed} removed · {result.findings ?? 0} findings</Text>{result.warnings?.map((warning, i) => <Text key={i} color="yellow">Note: {warning}</Text>)}</Box> }

export const RICH_VIEWS = {
  ask: (result: AskResult) => <AskView result={result} />,
  gate: (result: GateRunResult) => <GateView result={result} />,
  index: (result: IndexResult) => <IndexView result={result} />,
  diff: (result: DiffResult) => <DiffView result={result} />,
  doctor: (result: DoctorReport) => <DoctorView result={result} />,
  'vault-export': (result: VaultExportResult) => <VaultExportView result={result} />,
} as const

export const printRich = (element: React.ReactElement): void => { render(element, { stdout: process.stdout, exitOnCtrlC: false }) }
