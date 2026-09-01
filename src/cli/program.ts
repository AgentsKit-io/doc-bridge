import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { ConfigNotFoundError, loadConfig, projectRootFromConfigPath } from '../config/load-config.js'
import type { DocBridgeConfigV1, RuleId, RuleSeverity } from '../config/schema.js'
import {
  DOCUMENTATION_STANDARD_V1_ID,
  formatDocumentationStandardText,
  runDocumentationStandardV1,
} from '../conformance/documentation-standard-v1.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { applyDocumentationDeclarations } from '../discovery/documentation.js'
import { discoverRepository } from '../discovery/repository.js'
import { discoverPnpmPackages } from '../index-builder/plugins/pnpm-monorepo.js'
import { scanHumanDocRecords } from '../index-builder/human-adapters/index.js'
import { retrieveHybridChunks } from '../federation/llms.js'
import { runGates, type GateId } from '../gates/run-gates.js'
import { evaluateRules, parseRuleId, parseRuleSeverity, type RuleMode } from '../rules/engine.js'
import { runChatOnce, startInkChat } from '../intelligence/chat.js'
import { PeerMissingError, layer1InstallHint } from '../intelligence/peers.js'
import { createDocBridgeRag } from '../intelligence/rag.js'
import { firstHeading, firstParagraph } from '../lib/markdown.js'
import { ingestMemoryCandidates } from '../memory/ingest.js'
import { classifyMemoryCandidates, draftMemoryPromotion } from '../memory/pipeline.js'
import { promoteMemoryToGithubPr } from '../memory/github-pr.js'
import { watchDocBridgeIndex } from '../index-builder/watch-index.js'
import { loadWorkflowStepOutput, runWorkflow, type WorkflowExecutionResult } from '../workflow/engine.js'
import {
  formatDoctorBadgeJson,
  formatDoctorBadgeMarkdown,
} from '../doctor/badge.js'
import { docBridgePatternMarkdown, docBridgePatternPayload } from '../playbook/doc-bridge-pattern.js'
import { formatDemoText, runDemo, withDemoWorkspace, type DemoFixture } from './demo.js'
import { formatDoctorText, runDoctor } from '../doctor/run-doctor.js'
import { installMcpConfig, mcpSnippet } from '../mcp/install.js'
import { startMcpStdioServer } from '../mcp/server.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'
import { runQuery, type QueryKind } from '../query/query.js'
import { searchIndex } from '../query/search.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { parseAgentHandoff, parseDocBridgeConfig, parseReconciliationReport } from '../validate.js'
import { parseDiscoverySnapshot } from '../validate.js'
import { reconcileKnowledge } from '../reconciliation/reconcile.js'
import type { DiscoverySnapshotV1, ReconciliationReportV1 } from '../schemas/knowledge.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { applyFixProposal, approveFixProposal, createArtifactNormalizationProposal, createMarkdownLinkFixProposal } from '../fixes/proposals.js'
import { createRegistryAgentAdapter, loadRegistryAgentRunner, persistRegistryAgentProposal } from '../agents/registry-adapter.js'
import { renderOfflineReportArtifact } from '../report/html.js'
import { benchmarkFixture, formatBenchmarkText, measureBenchmark } from '../metrics/benchmark.js'
import { PACKAGE_VERSION } from '../version.js'
import { auditDocumentation, formatDocumentationAuditText } from '../audit/documentation.js'
import {
  formatHistoricalEvidenceText,
  formatStudyProtocolText,
  parseHistoricalEvidenceRegistry,
  parseStudyProtocol,
  validateHistoricalEvidenceRegistry,
} from '../study/protocol.js'
import {
  formatStudyTaskSuiteText,
  parseStudyTaskSuite,
  selectTaskExecutions,
} from '../study/task-suite.js'
import {
  formatControlledStudyRunPlanText,
  parseControlledStudyLedger,
  parseControlledStudyRunPlan,
} from '../study/runner.js'
import { formatControlledStudyRunText, parseStudyRepositoryConfig, runControlledStudy } from '../study/execution.js'
import { independentlyAdjudicateStudyLedger, persistIndependentlyAdjudicatedLedger } from '../study/adjudication.js'
import { formatStudyProviderCliText, parseStudyProviderCliConfig } from '../study/provider-cli.js'
import { calculateStudyMetrics, formatStudyMetricsText } from '../study/metrics.js'
import { formatStudyVerificationText, parseStudyVerificationBinding } from '../study/verification.js'

type Command =
  | 'help'
  | 'version'
  | 'validate-config'
  | 'validate-handoff'
  | 'init'
  | 'bootstrap'
  | 'memory'
  | 'playbook'
  | 'registry'
  | 'discover'
  | 'benchmark'
  | 'study'
  | 'scan'
  | 'reconcile'
  | 'check'
  | 'map'
  | 'fix'
  | 'suggest'
  | 'index'
  | 'gate'
  | 'rules'
  | 'mcp'
  | 'doctor'
  | 'demo'
  | 'query'
  | 'search'
  | 'retrieve'
  | 'ask'
  | 'chat'
  | 'rag'
  | 'list'
  | 'conformance'
  | 'audit'

const usage = `ak-docs — human↔agent documentation bridge (@agentskit/doc-bridge)

Core (no API key):
  ak-docs init [--demo] [--scaffold-workspaces]
  ak-docs demo [--fixture example|monorepo] [--text] [--in-project]
  ak-docs doctor [--text] [--badge] [--write-badge]
  ak-docs index [--watch]
  ak-docs discover [--text|--json]
  ak-docs benchmark <fixture.json> <observation.json> [--text|--json]
  ak-docs study protocol <protocol.json> [--text|--json]
  ak-docs study history <registry.json> [--protocol <protocol.json>] [--text|--json]
  ak-docs study tasks <task-suite.json> [--text|--json]
  ak-docs study select <task-suite.json> [--text|--json]
  ak-docs study plan <run-plan.json> [--text|--json]
  ak-docs study providers <provider-cli.json> [--text|--json]
  ak-docs study run <run-plan.json> <task-suite.json> --providers <provider-cli.json> --repositories <repositories.json> --ledger <ledger.json> [--round <id>] [--dry-run] [--text|--json]
  ak-docs study adjudicate <observation-ledger.json> <task-suite.json> --adjudicator <provider-cli.json> --output <ledger.json> [--run-id <id>] [--offset <n>] [--limit <n>] [--text|--json]
  ak-docs study ledger <observation-ledger.json> [--text|--json]
  ak-docs study verification <binding.json> [--text|--json]
  ak-docs study metrics <observation-ledger.json> [--baseline-round <id>] [--current-round <id>] [--baseline-run-id <id>] [--current-run-id <id>] [--allow-regressions] [--text|--json]
  ak-docs scan | reconcile | check | map [--text|--json] [--html] [--report-threshold <bytes>]
  ak-docs fix propose links|normalize <artifact> [--output <file>]
  ak-docs fix approve|apply <proposal.json> [--by <name>]
  ak-docs suggest [--json|--text]   run the configured local Registry agent
  ak-docs query [package|ownership|intent|change] <id> [--agent] [--text]
  ak-docs search <term> [--agent] [--text]
  ak-docs list <packages|intents|changes|knowledge> [--text]
  ak-docs ask [question]          local consult (no LLM)
  ak-docs gate run [gate-id]
  ak-docs rules run <report.json> [--preset default|recommended|strict] [--severity rule=level] [--ignore rule]
  ak-docs conformance run documentation-standard-v1 [--text|--json]
  ak-docs audit documentation [--text|--json]
  ak-docs mcp
  ak-docs mcp install --cursor | --claude
  ak-docs memory ingest|classify|promote [--pr] [--dry-run]
  ak-docs bootstrap agent-docs
  ak-docs validate-config | validate-handoff <file>

Intelligence (optional AgentsKit peers):
  ak-docs rag ingest|search <query>
  ak-docs chat                    terminal chat (Ink + RAG)
  ak-docs ask <question> --chat   one-shot grounded answer

Advanced / ecosystem:
  ak-docs retrieve <query>
  ak-docs registry topology
  ak-docs playbook draft | pattern [--text]

Global flags:
  -h, --help   --version
  --config <path>   (project root = config file directory)
  --agent   --json   --text   --chat   --demo
`

const QUERY_KINDS = new Set<QueryKind>(['package', 'ownership', 'intent', 'change', 'search'])
const LIST_KINDS = new Set(['packages', 'intents', 'changes', 'knowledge'])
const GATE_IDS = new Set<GateId>([
  'index-freshness',
  'human-guide-links',
  'okf-type',
  'docs-style',
  'documentation-standard-v1',
])

const parseArgs = (argv: readonly string[]) => {
  const flags = new Set<string>()
  let configPath: string | undefined
  const positional: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === '--config') {
      configPath = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('-')) {
      flags.add(arg)
      continue
    }
    positional.push(arg)
  }

  let command: Command = 'help'
  if (flags.has('--version') || flags.has('-V')) command = 'version'
  else if (flags.has('--help') || flags.has('-h')) command = 'help'
  else if (positional[0] === 'validate-config') command = 'validate-config'
  else if (positional[0] === 'validate-handoff') command = 'validate-handoff'
  else if (positional[0] === 'init') command = 'init'
  else if (positional[0] === 'bootstrap') command = 'bootstrap'
  else if (positional[0] === 'memory') command = 'memory'
  else if (positional[0] === 'playbook') command = 'playbook'
  else if (positional[0] === 'registry') command = 'registry'
  else if (positional[0] === 'discover') command = 'discover'
  else if (positional[0] === 'benchmark') command = 'benchmark'
  else if (positional[0] === 'study') command = 'study'
  else if (positional[0] === 'scan') command = 'scan'
  else if (positional[0] === 'reconcile') command = 'reconcile'
  else if (positional[0] === 'check') command = 'check'
  else if (positional[0] === 'map') command = 'map'
  else if (positional[0] === 'fix') command = 'fix'
  else if (positional[0] === 'suggest') command = 'suggest'
  else if (positional[0] === 'index') command = 'index'
  else if (positional[0] === 'gate') command = 'gate'
  else if (positional[0] === 'rules') command = 'rules'
  else if (positional[0] === 'mcp') command = 'mcp'
  else if (positional[0] === 'doctor') command = 'doctor'
  else if (positional[0] === 'demo') command = 'demo'
  else if (positional[0] === 'query') command = 'query'
  else if (positional[0] === 'search') command = 'search'
  else if (positional[0] === 'retrieve') command = 'retrieve'
  else if (positional[0] === 'ask') command = 'ask'
  else if (positional[0] === 'chat') command = 'chat'
  else if (positional[0] === 'rag') command = 'rag'
  else if (positional[0] === 'list') command = 'list'
  else if (positional[0] === 'conformance') command = 'conformance'
  else if (positional[0] === 'audit') command = 'audit'

  return { command, flags, configPath, positional }
}

const optionValues = (argv: readonly string[], name: string): string[] => {
  const values: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg?.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1))
    else if (arg === name && argv[index + 1] && !argv[index + 1]?.startsWith('-')) {
      values.push(argv[index + 1] as string)
      index += 1
    }
  }
  return values
}

const parseRuleAssignments = <T>(values: readonly string[], parseValue: (value: string) => T): Record<string, T> => {
  const result: Record<string, T> = {}
  for (const value of values) {
    const separator = value.indexOf('=')
    if (separator <= 0 || separator === value.length - 1) throw new Error(`Invalid rule assignment "${value}". Use rule=value.`)
    const key = value.slice(0, separator)
    result[key] = parseValue(value.slice(separator + 1))
  }
  return result
}

const writeJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

const writeLines = (lines: readonly string[]): void => {
  process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '')
}

const textValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'Not found'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

const writeTextQuery = (payload: unknown): void => {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    writeLines([textValue(payload)])
    return
  }

  const result = payload as { readonly type?: unknown; readonly data?: unknown }
  if (result.type === 'search') {
    const data = result.data as {
      readonly term?: unknown
      readonly count?: unknown
      readonly matches?: readonly {
        readonly type: string
        readonly id: string
        readonly path: string
        readonly summary?: string
      }[]
    }
    const matches = data.matches ?? []
    writeLines([
      `Search: ${String(data.term ?? '')}`,
      `Matches: ${String(data.count ?? matches.length)}`,
      ...(matches.length
        ? matches.map((match) =>
            formatSearchMatch(match as { type: string; id: string; path: string; summary?: string }),
          )
        : ['  (none)']),
    ])
    return
  }

  writeLines([textValue(result.data)])
}

const formatSearchMatch = (match: {
  readonly type: string
  readonly id: string
  readonly path: string
  readonly summary?: string
  readonly score?: number
}): string => {
  const summary = match.summary ? match.summary.replace(/\s+/g, ' ').slice(0, 100) : ''
  const score = typeof match.score === 'number' ? ` score=${match.score}` : ''
  return `  [${match.type}] ${match.id}${score}\n    ${match.path}${summary ? `\n    ${summary}` : ''}`
}

const writeTextSearch = (
  term: string,
  matches: readonly {
    readonly type: string
    readonly id: string
    readonly path: string
    readonly summary?: string
    readonly score?: number
  }[],
): void => {
  writeLines([
    `Search: ${term}`,
    `Matches: ${matches.length}`,
    ...(matches.length ? matches.map(formatSearchMatch) : ['  (none)']),
  ])
}

const handoffSummaryLines = (
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
  ownerId: string,
): string[] => {
  try {
    const handoff = runQuery(index, config, { kind: 'ownership', id: ownerId, agent: true })
    if (!handoff || typeof handoff !== 'object' || !('editRoots' in handoff)) return []
    const payload = handoff as {
      startHere?: string
      editRoots?: string[]
      checks?: string[]
      humanDoc?: string | null
      bridge?: { humanDoc?: string; action?: string }
    }
    const bridgeLine =
      payload.bridge?.humanDoc === 'missing'
        ? `Bridge: human guide missing → ${payload.bridge.action ?? 'ak-docs bootstrap agent-docs'}`
        : payload.humanDoc
          ? `Bridge: ${payload.humanDoc}`
          : 'Bridge: (no human plugin configured)'
    return [
      '',
      'Handoff preview',
      `  start:  ${payload.startHere ?? '(unknown)'}`,
      `  edit:   ${(payload.editRoots ?? []).join(', ') || '(none)'}`,
      `  checks: ${(payload.checks ?? []).join(' · ') || '(none)'}`,
      `  ${bridgeLine}`,
    ]
  } catch {
    return []
  }
}

const writeAsk = (
  question: string,
  matches: ReturnType<typeof searchIndex>,
  index: DocBridgeIndexV1,
  config: DocBridgeConfigV1,
): void => {
  // Prefer ownership match for routing questions
  const owner =
    matches.find((match) => match.type === 'ownership') ??
    matches.find((match) => Boolean(index.lookup?.ownership?.[match.id]))
  const best = owner ?? matches[0]
  const ownerId =
    best && (best.type === 'ownership' || index.lookup?.ownership?.[best.id]) ? best.id : undefined
  const bestQuery = ownerId
    ? `ak-docs query ownership ${ownerId} --agent`
    : 'ak-docs list knowledge --text'
  writeLines([
    `Question: ${question}`,
    best ? `Best match: ${best.type} ${best.id} (${best.path})` : 'Best match: none',
    ...(ownerId ? handoffSummaryLines(index, config, ownerId) : []),
    '',
    'Matches:',
    ...(
      matches.length
        ? matches.slice(0, 5).map(formatSearchMatch)
        : ['  No local matches. Try: ak-docs search <term>']
    ),
    '',
    'Next commands:',
    ...(best
      ? [
          `ak-docs search "${question}" --agent`,
          bestQuery,
          ...(ownerId ? [`ak-docs doctor --text`] : []),
        ]
      : ['ak-docs list knowledge --text', 'ak-docs doctor --text']),
  ])
}

const readIndexedDoc = (root: string, config: DocBridgeConfigV1, idOrPath: string): string => {
  const index = loadDocBridgeIndex(root, config)
  const entry = index.knowledge.find((doc) => doc.id === idOrPath || doc.path === idOrPath)
  if (!entry) throw new Error(`Unknown indexed doc "${idOrPath}". Try: search ${idOrPath}`)

  const abs = resolve(root, entry.path)
  const rootAbs = resolve(root)
  if (abs !== rootAbs && !abs.startsWith(`${rootAbs}/`)) {
    throw new Error(`Indexed doc escapes project root: ${entry.path}`)
  }
  return readFileSync(abs, 'utf8')
}

const runAskRepl = async (root: string, config: DocBridgeConfigV1): Promise<number> => {
  const index = loadDocBridgeIndex(root, config)
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  try {
    for (;;) {
      const line = (await rl.question('ak-docs> ')).trim()
      if (!line) continue
      if (line === 'exit' || line === 'quit') return 0

      const [command, ...rest] = line.split(/\s+/)
      const value = rest.join(' ').trim()
      try {
        if (command === 'search') {
          writeTextSearch(value, searchIndex(index, value))
        } else if (command === 'read' || command === 'open') {
          process.stdout.write(`${readIndexedDoc(root, config, value).slice(0, 8000)}\n`)
        } else if (command === 'resolve') {
          writeJson(runQuery(index, config, { kind: 'ownership', id: value, agent: true }))
        } else if (command === 'gate') {
          const gateId = value || undefined
          writeJson(runGates(root, config, gateId ? [gateId as GateId] : undefined))
        } else {
          writeAsk(line, searchIndex(index, line, 8), index, config)
        }
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      }
    }
  } finally {
    rl.close()
  }
}

const wantsTextOutput = (flags: ReadonlySet<string>, config: DocBridgeConfigV1): boolean =>
  !flags.has('--agent') &&
  (flags.has('--text') || (!flags.has('--json') && config.surfaces?.cli?.defaultFormat === 'text'))

const loadProject = (configPath?: string) => {
  const loadOpts = configPath ? { explicitPath: configPath } : {}
  const { config, path } = loadConfig(loadOpts)
  parseDocBridgeConfig(config)
  const root = projectRootFromConfigPath(path, config.project?.root)
  return { config, configPath: path, root }
}

const indexDiagnostics = (config: DocBridgeConfigV1, result: ReturnType<typeof buildDocBridgeIndex>): string[] => {
  const diagnostics: string[] = []
  const onlyDoc = result.index.knowledge.length === 1 ? result.index.knowledge[0] : undefined
  if (onlyDoc?.path === config.corpus.agent.index) {
    diagnostics.push(
      `Only the starter ${config.corpus.agent.index} was indexed.`,
      `Add agent docs under ${config.corpus.agent.root}/, then run ak-docs index again.`,
    )
  }
  const handoffCount = Object.keys(result.index.handoffs ?? {}).length
  if (handoffCount === 0) {
    diagnostics.push(
      'No ownership handoffs yet. Add routing.options.ownership, package frontmatter (package + editRoot), or a monorepo plugin.',
    )
  }
  return diagnostics
}

const diagnosticNextCommands = (
  config: DocBridgeConfigV1,
  result: ReturnType<typeof buildDocBridgeIndex>,
): string[] => {
  const handoffIds = Object.keys(result.index.handoffs ?? {})
  if (handoffIds[0]) {
    return [
      `ak-docs query package ${handoffIds[0]} --agent`,
      `ak-docs list packages --text`,
      'ak-docs mcp',
    ]
  }
  return [
    `mkdir -p ${config.corpus.agent.root}/packages`,
    `edit ${config.corpus.agent.root}/packages/<module>.md  # frontmatter: package + editRoot`,
    'ak-docs index',
  ]
}

const workflowOptions = (
  root: string,
  config: DocBridgeConfigV1,
  sourceRevision: string,
  stage: 'collect' | 'normalize' | 'reconcile' | 'evaluate' | 'report',
  handlers: Parameters<typeof runWorkflow>[0]['handlers'],
  versions?: Pick<Parameters<typeof runWorkflow>[0], 'pipelineVersion' | 'analyzerVersions'>,
): Parameters<typeof runWorkflow>[0] => ({
  root,
  ...(config.workflow?.stateDir ? { stateDir: config.workflow.stateDir } : {}),
  sourceRevision,
  configurationHash: sha256NormalizedV1(config),
  toolVersion: PACKAGE_VERSION,
  ...(versions?.pipelineVersion ? { pipelineVersion: versions.pipelineVersion } : {}),
  ...(versions?.analyzerVersions ? { analyzerVersions: versions.analyzerVersions } : {}),
  stage,
  handlers,
})

const scanWorkflow = (root: string, config: DocBridgeConfigV1): WorkflowExecutionResult => {
  const discovered = discoverRepository({ root, config })
  const versions = { pipelineVersion: discovered.pipelineVersion, analyzerVersions: discovered.analyzerVersions }
  runWorkflow(workflowOptions(root, config, discovered.sourceRevision, 'collect', { collect: () => discovered }, versions))
  return runWorkflow(workflowOptions(root, config, discovered.sourceRevision, 'normalize', { normalize: ({ input }) => input }, versions))
}

const documentationInputs = (root: string, snapshot: DiscoverySnapshotV1) => snapshot.entities
  .filter((entity) => entity.kind === 'document' && entity.path)
  .map((entity) => ({ path: entity.path as string, content: readFileSync(resolve(root, entity.path as string), 'utf8') }))

const reconcileWorkflow = (root: string, config: DocBridgeConfigV1): WorkflowExecutionResult => {
  const scanned = scanWorkflow(root, config)
  const snapshot = parseDiscoverySnapshot(loadWorkflowStepOutput(scanned.stateDir, 'normalize'))
  const declared = applyDocumentationDeclarations(snapshot, documentationInputs(root, snapshot), {
    agentRoot: config.corpus.agent.root,
  }).snapshot
  const report = reconcileKnowledge(snapshot, declared, {
    ...(config.reconciliation?.scope === undefined ? {} : { scope: config.reconciliation.scope }),
    ...(config.reconciliation?.requiredRelationKinds === undefined ? {} : { requiredRelationKinds: config.reconciliation.requiredRelationKinds }),
    ...(config.reconciliation?.requiredRelationTargets === undefined ? {} : { requiredRelationTargets: config.reconciliation.requiredRelationTargets }),
    ...(config.reconciliation?.includeOrphanedDocuments === undefined ? {} : { includeOrphanedDocuments: config.reconciliation.includeOrphanedDocuments }),
  })
  return runWorkflow(workflowOptions(root, config, snapshot.sourceRevision, 'reconcile', { reconcile: () => report }, { pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions }))
}

const checkWorkflow = (root: string, config: DocBridgeConfigV1): WorkflowExecutionResult => {
  const reconciled = reconcileWorkflow(root, config)
  const report = parseReconciliationReport(loadWorkflowStepOutput(reconciled.stateDir, 'reconcile'))
  const versions = { pipelineVersion: report.pipelineVersion, analyzerVersions: report.analyzerVersions }
  runWorkflow(workflowOptions(root, config, report.sourceRevision, 'evaluate', { evaluate: () => evaluateRules(report, { ...(config.rules ? { config: config.rules } : {}) }) }, versions))
  return runWorkflow(workflowOptions(root, config, report.sourceRevision, 'report', { report: ({ input }) => input }, versions))
}

const workflowOutput = (result: WorkflowExecutionResult): Record<string, unknown> => {
  const snapshot = (() => { try { return parseDiscoverySnapshot(loadWorkflowStepOutput(result.stateDir, 'normalize')) } catch { return undefined } })()
  const report = (() => { try { return parseReconciliationReport(loadWorkflowStepOutput(result.stateDir, 'reconcile')) } catch { return undefined } })()
  const rules = (() => {
    try {
      const value = loadWorkflowStepOutput(result.stateDir, 'evaluate')
      return value && typeof value === 'object' ? value : undefined
    } catch { return undefined }
  })()
  return {
    ok: result.run.state !== 'failed' && result.run.state !== 'stale',
    runId: result.run.runId,
    state: result.run.state,
    stateDir: result.stateDir,
    artifactRefs: result.run.artifactRefs,
    steps: result.run.steps,
    reusedStages: result.reusedStages,
    ...(snapshot ? { snapshotHash: snapshot.contentHash, sourceRevision: snapshot.sourceRevision, configurationHash: snapshot.configurationHash, coverage: snapshot.coverage } : {}),
    ...(report ? { reportHash: report.contentHash, diagnostics: report.diagnostics } : {}),
    ...(rules ? { rules } : {}),
  }
}

const writeAtomicFile = (path: string, content: string): void => {
  const temporaryPath = `${path}.tmp-${process.pid}`
  writeFileSync(temporaryPath, content, 'utf8')
  renameSync(temporaryPath, path)
}

const writeReportArtifact = (htmlPath: string, artifact: ReturnType<typeof renderOfflineReportArtifact>): string => {
  mkdirSync(dirname(htmlPath), { recursive: true })
  if (artifact.mode === 'single-file') {
    writeAtomicFile(htmlPath, artifact.indexHtml)
    const artifactDir = htmlPath.replace(/\.html?$/i, '')
    if (existsSync(artifactDir)) rmSync(artifactDir, { recursive: true, force: true })
    return htmlPath
  }

  const artifactDir = htmlPath.replace(/\.html?$/i, '')
  const temporaryDir = `${artifactDir}.tmp-${process.pid}`
  const backupDir = `${artifactDir}.previous-${process.pid}`
  const launcherTemp = `${htmlPath}.tmp-${process.pid}`
  rmSync(temporaryDir, { recursive: true, force: true })
  rmSync(backupDir, { recursive: true, force: true })
  mkdirSync(temporaryDir, { recursive: true })
  for (const [file, content] of Object.entries(artifact.files)) {
    const filePath = resolve(temporaryDir, file)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf8')
  }
  writeFileSync(resolve(temporaryDir, 'manifest.json'), artifact.manifest, 'utf8')
  const frameSource = `${relative(dirname(htmlPath), artifactDir)}/index.html`
  const launcher = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Doc Bridge report</title></head><body style="margin:0"><iframe title="Doc Bridge report" src="${frameSource}" style="border:0;width:100vw;height:100vh"></iframe></body></html>`
  writeFileSync(launcherTemp, launcher, 'utf8')
  try {
    if (existsSync(artifactDir)) renameSync(artifactDir, backupDir)
    renameSync(temporaryDir, artifactDir)
    renameSync(launcherTemp, htmlPath)
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true })
  } catch (error) {
    if (existsSync(backupDir)) {
      const failedDir = `${artifactDir}.failed-${process.pid}`
      if (existsSync(artifactDir)) renameSync(artifactDir, failedDir)
      renameSync(backupDir, artifactDir)
      if (existsSync(failedDir)) rmSync(failedDir, { recursive: true, force: true })
    } else if (existsSync(artifactDir)) rmSync(artifactDir, { recursive: true, force: true })
    if (existsSync(temporaryDir)) rmSync(temporaryDir, { recursive: true, force: true })
    if (existsSync(launcherTemp)) rmSync(launcherTemp, { force: true })
    throw error
  }
  return artifactDir
}

const runWorkflowCommand = (
  command: 'scan' | 'reconcile' | 'check' | 'map',
  flags: ReadonlySet<string>,
  configPath: string | undefined,
  argv: readonly string[],
): number => {
  try {
    const { config, root } = loadProject(configPath)
    const result = command === 'scan' ? scanWorkflow(root, config) : command === 'reconcile' ? reconcileWorkflow(root, config) : checkWorkflow(root, config)
    const output = workflowOutput(result)
    if (command === 'map') output.kind = 'architecture-map'
    if (command === 'map' && flags.has('--html')) {
      const snapshot = parseDiscoverySnapshot(loadWorkflowStepOutput(result.stateDir, 'normalize'))
      const report = parseReconciliationReport(loadWorkflowStepOutput(result.stateDir, 'reconcile'))
      const outputPath = optionValues(argv, '--output')[0] ?? '.doc-bridge/report.html'
      const htmlPath = resolve(root, outputPath)
      mkdirSync(dirname(htmlPath), { recursive: true })
      const thresholdValue = optionValues(argv, '--report-threshold')[0]
      const thresholdBytes = thresholdValue === undefined ? undefined : Number(thresholdValue)
      if (thresholdBytes !== undefined && (!Number.isSafeInteger(thresholdBytes) || thresholdBytes < 1)) throw new Error('--report-threshold must be a positive integer.')
      const artifact = renderOfflineReportArtifact({ snapshot, report }, { ...(config.report?.privacy ? { privacy: config.report.privacy } : {}), ...(thresholdBytes === undefined ? {} : { thresholdBytes }) })
      output.htmlPath = writeReportArtifact(htmlPath, artifact)
      output.htmlMode = artifact.mode
    }
    if (wantsTextOutput(flags, config)) {
      writeLines([`Run: ${String(output.runId)}`, `State: ${String(output.state)}`, ...(output.snapshotHash ? [`Snapshot: ${String(output.snapshotHash)}`] : []), ...(output.reportHash ? [`Report: ${String(output.reportHash)}`] : []), `Artifacts: ${String((output.artifactRefs as unknown[]).length)}`])
    } else writeJson(output)
    const ruleExitCode = output.rules && typeof output.rules === 'object' && 'exitCode' in output.rules && (output.rules as { exitCode?: unknown }).exitCode === 1 ? 1 : 0
    return result.run.state === 'failed' ? 1 : ruleExitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

const runDocumentationAuditCommand = (
  flags: ReadonlySet<string>,
  positional: readonly string[],
  configPath: string | undefined,
): number => {
  if (positional[1] !== 'documentation') {
    process.stderr.write('Usage: ak-docs audit documentation [--text|--json]\n')
    return 1
  }
  try {
    const { config, root } = loadProject(configPath)
    const scanned = scanWorkflow(root, config)
    const snapshot = parseDiscoverySnapshot(loadWorkflowStepOutput(scanned.stateDir, 'normalize'))
    const analysis = applyDocumentationDeclarations(snapshot, documentationInputs(root, snapshot), { agentRoot: config.corpus.agent.root })
    const reconciliation = reconcileKnowledge(snapshot, analysis.snapshot, {
      ...(config.reconciliation?.scope === undefined ? {} : { scope: config.reconciliation.scope }),
      ...(config.reconciliation?.requiredRelationKinds === undefined ? {} : { requiredRelationKinds: config.reconciliation.requiredRelationKinds }),
      ...(config.reconciliation?.requiredRelationTargets === undefined ? {} : { requiredRelationTargets: config.reconciliation.requiredRelationTargets }),
      includeOrphanedDocuments: config.reconciliation?.includeOrphanedDocuments ?? true,
    })
    const report = auditDocumentation({
      root,
      snapshot,
      declared: analysis.snapshot,
      reconciliation,
      declarationDiagnostics: analysis.diagnostics,
      ...(config.audit?.documentation ? { config: config.audit.documentation } : {}),
    })
    if (wantsTextOutput(flags, config)) writeLines(formatDocumentationAuditText(report))
    else writeJson({ ok: report.status !== 'blocked', report })
    return report.status === 'blocked' ? 1 : 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

const runRulesCommand = (
  argv: readonly string[],
  flags: ReadonlySet<string>,
  positional: readonly string[],
  configPath: string | undefined,
): number => {
  const action = positional[1]
  const reportPath = positional[2]
  if (action !== 'run' || !reportPath) {
    process.stderr.write('Usage: ak-docs rules run <report.json> [--preset default|recommended|strict] [--severity rule=level] [--ignore rule]\n')
    return 2
  }

  try {
    const { config } = loadProject(configPath)
    const report = parseReconciliationReport(JSON.parse(readFileSync(resolve(reportPath), 'utf8')) as unknown)
    const presetValue = optionValues(argv, '--preset')[0]
    const preset = presetValue === undefined
      ? undefined
      : (['default', 'recommended', 'strict'].includes(presetValue) ? presetValue as RuleMode : (() => { throw new Error(`Invalid rules preset "${presetValue}".`) })())
    const severity: Partial<Record<RuleId, RuleSeverity>> = {}
    for (const [rule, level] of Object.entries(parseRuleAssignments(optionValues(argv, '--severity'), parseRuleSeverity))) {
      severity[parseRuleId(rule)] = level
    }
    const ignore = optionValues(argv, '--ignore').map(parseRuleId)
    const result = evaluateRules(report, {
      ...(config.rules ? { config: config.rules } : {}),
      ...(preset ? { preset } : {}),
      ...(Object.keys(severity).length ? { severity } : {}),
      ...(ignore.length ? { ignore } : {}),
      ...(optionValues(argv, '--critical-entity').length ? { criticalEntities: optionValues(argv, '--critical-entity') } : {}),
      ...(optionValues(argv, '--critical-path').length ? { criticalPaths: optionValues(argv, '--critical-path') } : {}),
    })
    if (wantsTextOutput(flags, config)) {
      writeLines([
        `Rules: ${result.mode}`,
        `Findings: ${result.findings.length}`,
        ...(result.findings.length ? result.findings.map((finding) => `  [${finding.severity}] ${finding.code}: ${finding.message}`) : ['  (none)']),
        `Exit code: ${result.exitCode}`,
      ])
    } else {
      writeJson({ ok: result.exitCode === 0, reportHash: report.contentHash, ...result })
    }
    return result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

const runFixCommand = (argv: readonly string[], positional: readonly string[], configPath: string | undefined): number => {
  try {
    const { config, root } = loadProject(configPath)
    const action = positional[1]
    const proposalPath = positional[2]
    const sourceRevision = discoverRepository({ root, config }).sourceRevision
    const fixOptions = { baseRevision: sourceRevision, configurationHash: sha256NormalizedV1(config), ...(config.project?.name ? { projectName: config.project.name } : {}) }
    if (action === 'propose') {
      const proposal = positional[2] === 'links'
        ? createMarkdownLinkFixProposal(root, fixOptions)
        : positional[2] === 'normalize' && positional[3] ? createArtifactNormalizationProposal(root, positional[3], fixOptions) : undefined
      if (!proposal) { writeJson({ ok: true, proposal: null }); return 0 }
      const outputPath = optionValues(argv, '--output')[0]
      if (outputPath) { mkdirSync(dirname(resolve(root, outputPath)), { recursive: true }); writeFileSync(resolve(root, outputPath), `${JSON.stringify(proposal, null, 2)}\n`, 'utf8') }
      writeJson({ ok: true, proposal, ...(outputPath ? { proposalPath: resolve(root, outputPath) } : {}) })
      return 0
    }
    if (!proposalPath || !['approve', 'apply'].includes(action ?? '')) throw new Error('Usage: ak-docs fix propose links|normalize <artifact> [--output <file>] | fix approve|apply <proposal.json> [--by <name>]')
    const file = resolve(root, proposalPath)
    const proposal = JSON.parse(readFileSync(file, 'utf8')) as unknown
    const result = action === 'approve' ? approveFixProposal(proposal, optionValues(argv, '--by')[0] ?? 'human') : applyFixProposal(root, proposal, { currentRevision: sourceRevision })
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    writeJson({ ok: true, proposal: result, proposalPath: file })
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

const runSuggestCommand = async (flags: ReadonlySet<string>, configPath: string | undefined): Promise<number> => {
  try {
    const { config, root } = loadProject(configPath)
    const stateDir = resolve(root, config.workflow?.stateDir ?? '.doc-bridge/workflow')
    const snapshot = parseDiscoverySnapshot(loadWorkflowStepOutput(stateDir, 'normalize'))
    const report = parseReconciliationReport(loadWorkflowStepOutput(stateDir, 'reconcile'))
    const runner = config.intelligence?.registry?.cli ? undefined : await loadRegistryAgentRunner(root, config)
    const adapter = createRegistryAgentAdapter(root, config, runner)
    const proposal = await adapter.run(snapshot, report)
    const proposalPath = persistRegistryAgentProposal(stateDir, proposal)
    if (flags.has('--text')) writeLines([`Agent: ${adapter.metadata.id}`, `Proposal: ${proposal.proposalId}`, `Hash: ${proposal.contentHash}`, `Saved: ${proposalPath}`])
    else writeJson({ ok: true, proposal, proposalPath })
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

const writeIfMissing = (path: string, contents: string): boolean => {
  mkdirSync(dirname(path), { recursive: true })
  try {
    const fd = openSync(path, 'wx')
    try {
      writeFileSync(fd, contents, 'utf8')
      return true
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

const demoOwnership = {
  example: {
    path: 'src',
    purpose: 'Starter ownership target — replace with your real modules',
    checks: ['npm test'],
    agentDoc: 'docs/for-agents/packages/example.md',
  },
}

const initConfigObject = (withDemo: boolean) => ({
  schemaVersion: 1 as const,
  corpus: { agent: { root: 'docs/for-agents' } },
  ...(withDemo
    ? {
        routing: {
          options: {
            ownership: demoOwnership,
          },
        },
      }
    : {}),
  gates: { preset: 'minimal' as const },
})

const initConfigContents = (path: string, withDemo: boolean): string => {
  if (path.endsWith('.ts') || path.endsWith('.mts')) {
    return [
      "import { defineConfig } from '@agentskit/doc-bridge/config'",
      '',
      'export default defineConfig({',
      '  schemaVersion: 1,',
      "  corpus: { agent: { root: 'docs/for-agents' } },",
      ...(withDemo
        ? [
            '  routing: {',
            '    options: {',
            '      ownership: {',
            "        example: { path: 'src', purpose: 'Starter ownership target', checks: ['npm test'], agentDoc: 'docs/for-agents/packages/example.md' },",
            '      },',
            '    },',
            '  },',
          ]
        : []),
      "  gates: { preset: 'minimal' },",
      '})',
      '',
    ].join('\n')
  }

  return `${JSON.stringify(initConfigObject(withDemo), null, 2)}\n`
}

const exampleAgentDoc = `---
type: package
package: example
editRoot: src
checks: [npm test]
---

# example

Starter agent doc generated by \`ak-docs init --demo\`.

Describe ownership, boundaries, and how agents should change this module.

## Checks

- \`npm test\`
`

const agentsMdSnippet = `# AGENTS.md

## Documentation routing (doc-bridge)

Before editing a package or module:

1. Run \`ak-docs query ownership <id> --agent\` (or MCP tool \`handoff.resolve\`)
2. Read \`startHere\` and respect \`editRoots\` + \`checks\`
3. Prefer agent docs under \`docs/for-agents/\`; human site links appear as \`humanDoc\`

Local consult without LLM: \`ak-docs ask "<question>"\`
Optional grounded chat (AgentsKit peers): \`ak-docs chat\`
`

const workspaceDocDraft = (id: string, path: string): string => [
  '---',
  'type: package',
  'draft: true',
  `package: ${id}`,
  `editRoot: ${path}`,
  '---',
  '',
  `# ${id}`,
  '',
  'Draft generated by `ak-docs init --scaffold-workspaces`.',
  '',
  '## Ownership',
  '',
  `- Package: \`${path}\``,
  '',
  '## Notes',
  '',
  '- TODO: describe responsibility, boundaries, and checks.',
  '',
].join('\n')

const scaffoldWorkspaceDocs = (
  root: string,
  config: DocBridgeConfigV1,
): { created: string[]; skipped: string[] } => {
  const created: string[] = []
  const skipped: string[] = []
  for (const pkg of discoverPnpmPackages(root, config)) {
    const path = resolve(root, config.corpus.agent.root, 'packages', `${pkg.id}.md`)
    if (writeIfMissing(path, workspaceDocDraft(pkg.id, pkg.path))) created.push(path)
    else skipped.push(path)
  }
  return { created, skipped }
}

const bootstrapAgentDocs = (
  root: string,
  config: DocBridgeConfigV1,
): { created: string[]; skipped: string[] } => {
  const created: string[] = []
  const skipped: string[] = []
  for (const doc of scanHumanDocRecords(root, config)) {
    const raw = readFileSync(doc.path, 'utf8')
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '')
    const title = firstHeading(body) ?? doc.id
    const description = firstParagraph(body)
    const draftPath = resolve(root, config.corpus.agent.root, 'human', `${doc.id}.md`)
    const draft = [
      '---',
      'type: knowledge',
      'draft: true',
      `id: ${doc.id}`,
      `humanDoc: ${doc.url}`,
      '---',
      '',
      `# ${title}`,
      '',
      'Draft generated by `ak-docs bootstrap agent-docs` from existing human docs.',
      '',
      ...(description ? ['## Source summary', '', description, ''] : []),
      '## Review checklist',
      '',
      '- TODO: confirm ownership, edit roots, and checks.',
      '- TODO: move this draft to the right agent-doc location if needed.',
      '',
    ].join('\n')
    if (writeIfMissing(draftPath, draft)) created.push(draftPath)
    else skipped.push(draftPath)
  }
  return { created, skipped }
}

const registryTopology = () => ({
  id: 'doc-curator',
  delegates: ['docs-chat', 'knowledge-promoter', 'code-review'],
  tools: ['handoff.resolve', 'doc.search', 'doc.get', 'gate.status', 'retriever.query'],
  steps: ['classify', 'draft', 'verify', 'review'],
  mergePolicy: { autoMerge: false, requiresHuman: true },
})

const runStudyCommand = async (flags: ReadonlySet<string>, positional: readonly string[], argv: readonly string[]): Promise<number> => {
  const action = positional[1]
  const inputPath = positional[2]
  if (!inputPath || !['protocol', 'history', 'tasks', 'select', 'plan', 'providers', 'run', 'adjudicate', 'ledger', 'metrics', 'verification'].includes(action ?? '')) {
    process.stderr.write('Usage: ak-docs study protocol|history|tasks|select|plan|providers|run|adjudicate|ledger|metrics|verification <artifact.json> [--protocol <protocol.json>] [--providers <provider-cli.json>] [--adjudicator <provider-cli.json>] [--repositories <repositories.json>] [--ledger <ledger.json>] [--output <ledger.json>] [--run-id <id>] [--limit <n>] [--round <id>] [--dry-run] [--baseline-round <id>] [--current-round <id>] [--text|--json]\n')
    return 1
  }
  try {
    if (action === 'run') {
      const taskSuitePath = positional[3]
      const providersPath = optionValues(argv, '--providers')[0]
      const repositoriesPath = optionValues(argv, '--repositories')[0]
      const ledgerPath = optionValues(argv, '--ledger')[0]
      if (!taskSuitePath || !providersPath || !repositoriesPath || !ledgerPath) throw new Error('Study run requires a task suite, --providers, --repositories, and --ledger.')
      const summary = await runControlledStudy({
        plan: parseControlledStudyRunPlan(JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as unknown),
        suite: parseStudyTaskSuite(JSON.parse(readFileSync(resolve(taskSuitePath), 'utf8')) as unknown),
        providers: parseStudyProviderCliConfig(JSON.parse(readFileSync(resolve(providersPath), 'utf8')) as unknown),
        repositories: parseStudyRepositoryConfig(JSON.parse(readFileSync(resolve(repositoriesPath), 'utf8')) as unknown),
        ledgerPath: resolve(ledgerPath),
        ...(optionValues(argv, '--round')[0] === undefined ? {} : { round: optionValues(argv, '--round')[0] }),
        ...(flags.has('--dry-run') ? { dryRun: true } : {}),
      })
      if (flags.has('--text')) writeLines(formatControlledStudyRunText(summary))
      else writeJson({ ok: summary.status === 'dry-run' || summary.status === 'completed', summary })
      return 0
    }
    if (action === 'adjudicate') {
      const taskSuitePath = positional[3]
      const adjudicatorConfigPath = optionValues(argv, '--adjudicator')[0]
      const outputPath = optionValues(argv, '--output')[0]
      if (!taskSuitePath || !adjudicatorConfigPath || !outputPath) throw new Error('Study adjudication requires a task suite, --adjudicator with an adjudicator, and --output.')
      const config = parseStudyProviderCliConfig(JSON.parse(readFileSync(resolve(adjudicatorConfigPath), 'utf8')) as unknown)
      if (!config.adjudicator) throw new Error('Study provider config must declare an adjudicator.')
      const ledger = parseControlledStudyLedger(JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as unknown)
      const suite = parseStudyTaskSuite(JSON.parse(readFileSync(resolve(taskSuitePath), 'utf8')) as unknown)
      const limitValue = optionValues(argv, '--limit')[0]
      const limit = limitValue === undefined ? undefined : Number(limitValue)
      const offsetValue = optionValues(argv, '--offset')[0]
      const offset = offsetValue === undefined ? undefined : Number(offsetValue)
      const result = await independentlyAdjudicateStudyLedger({ ledger, taskSuite: suite, config: config.adjudicator, configurationHash: config.contentHash, cwd: process.cwd(), maxRuntimeMs: suite.maxRuntimeMsPerTask, ...(optionValues(argv, '--run-id')[0] === undefined ? {} : { runId: optionValues(argv, '--run-id')[0] }), ...(offset === undefined ? {} : { offset }), ...(limit === undefined ? {} : { limit }) })
      persistIndependentlyAdjudicatedLedger(outputPath, result)
      if (flags.has('--text')) writeLines([`Adjudicated observations: ${result.observations.length}`, `Ledger: ${resolve(outputPath)}`, `Content hash: ${result.contentHash}`])
      else writeJson({ ok: true, ledger: result })
      return 0
    }
    const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as unknown
    if (action === 'protocol') {
      const protocol = parseStudyProtocol(input)
      if (flags.has('--text')) writeLines(formatStudyProtocolText(protocol))
      else writeJson({ ok: true, protocol })
      return 0
    }
    if (action === 'tasks') {
      const suite = parseStudyTaskSuite(input)
      if (flags.has('--text')) writeLines(formatStudyTaskSuiteText(suite))
      else writeJson({ ok: true, suite })
      return 0
    }
    if (action === 'select') {
      const suite = parseStudyTaskSuite(input)
      const executions = selectTaskExecutions(suite)
      if (flags.has('--text')) writeLines([`Selected executions: ${executions.length}`, `First execution: ${executions[0]?.taskId ?? 'none'} / ${executions[0]?.variantId ?? 'none'}`])
      else writeJson({ ok: true, executions })
      return 0
    }
    if (action === 'plan') {
      const plan = parseControlledStudyRunPlan(input)
      if (flags.has('--text')) writeLines(formatControlledStudyRunPlanText(plan))
      else writeJson({ ok: true, plan })
      return 0
    }
    if (action === 'providers') {
      const providers = parseStudyProviderCliConfig(input)
      if (flags.has('--text')) writeLines(formatStudyProviderCliText(providers))
      else writeJson({ ok: true, providers })
      return 0
    }
    if (action === 'ledger') {
      const ledger = parseControlledStudyLedger(input)
      if (flags.has('--text')) writeLines([`Ledger: ${ledger.ledgerVersion}`, `Observations: ${ledger.observations.length}`, `Content hash: ${ledger.contentHash}`])
      else writeJson({ ok: true, ledger })
      return 0
    }
    if (action === 'metrics') {
      const ledger = parseControlledStudyLedger(input)
      const baselineRound = optionValues(argv, '--baseline-round')[0]
      const currentRound = optionValues(argv, '--current-round')[0]
      const baselineRunId = optionValues(argv, '--baseline-run-id')[0]
      const currentRunId = optionValues(argv, '--current-run-id')[0]
      const report = calculateStudyMetrics(ledger.observations, { ...(baselineRound === undefined ? {} : { baselineRound }), ...(currentRound === undefined ? {} : { currentRound }), ...(baselineRunId === undefined ? {} : { baselineRunId }), ...(currentRunId === undefined ? {} : { currentRunId }) })
      if (flags.has('--text')) writeLines(formatStudyMetricsText(report))
      else writeJson({ ok: true, report })
      return report.comparisons.some((comparison) => comparison.status === 'regressed') && !flags.has('--allow-regressions') ? 1 : 0
    }
    if (action === 'verification') {
      const binding = parseStudyVerificationBinding(input)
      if (flags.has('--text')) writeLines(formatStudyVerificationText(binding))
      else writeJson({ ok: true, binding })
      return 0
    }
    const registry = parseHistoricalEvidenceRegistry(input)
    const protocolPath = optionValues(argv, '--protocol')[0]
    if (protocolPath) {
      const protocol = parseStudyProtocol(JSON.parse(readFileSync(resolve(protocolPath), 'utf8')) as unknown)
      validateHistoricalEvidenceRegistry(registry, protocol)
    }
    if (flags.has('--text')) writeLines(formatHistoricalEvidenceText(registry))
    else writeJson({ ok: true, registry })
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}

export const runCli = (argv: readonly string[]): number | undefined | Promise<number> => {
  const { command, flags, configPath, positional } = parseArgs(argv)

  if (command === 'help') {
    process.stdout.write(usage)
    return 0
  }

  if (command === 'version') {
    process.stdout.write(`ak-docs ${PACKAGE_VERSION} (@agentskit/doc-bridge)\n`)
    return 0
  }

  if (command === 'validate-config') {
    try {
      const { config, path } = loadConfig(
        configPath ? { explicitPath: configPath } : {},
      )
      parseDocBridgeConfig(config)
      writeJson({ ok: true, path, schemaVersion: config.schemaVersion })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'validate-handoff') {
    const file = positional[1]
    if (!file) {
      process.stderr.write('Missing handoff JSON file path.\n')
      return 1
    }
    try {
      const abs = resolve(file)
      const raw = readFileSync(abs, 'utf8')
      const handoff = parseAgentHandoff(JSON.parse(raw) as unknown)
      writeJson({ ok: true, handoff })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'discover') {
    try {
      let config: DocBridgeConfigV1 | undefined
      let root = process.cwd()
      try {
        const loaded = loadProject(configPath)
        config = loaded.config
        root = loaded.root
      } catch (error) {
        if (!(error instanceof ConfigNotFoundError) || configPath) throw error
      }
      const snapshot = discoverRepository({ root, ...(config ? { config } : {}) })
      if (wantsTextOutput(flags, config ?? { surfaces: { cli: { defaultFormat: 'json' } } } as DocBridgeConfigV1)) {
        writeLines([`Project: ${snapshot.project.name}`, `Entities: ${snapshot.entities.length}`, `Relations: ${snapshot.relations.length}`, `Source revision: ${snapshot.sourceRevision}`, ...(config ? [] : ['No configuration found; discovery used safe defaults.'])])
      } else {
        writeJson({ ok: true, snapshot, ...(config ? {} : { proposedConfig: { schemaVersion: 1, corpus: { agent: { root: 'docs/for-agents' } } } }) })
      }
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 2
    }
  }

  if (command === 'benchmark') {
    const fixturePath = positional[1]
    const observationPath = positional[2]
    if (!fixturePath || !observationPath) {
      process.stderr.write('Usage: ak-docs benchmark <fixture.json> <observation.json> [--text|--json]\n')
      return 1
    }
    try {
      const fixture = benchmarkFixture(JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) as unknown)
      const observation = JSON.parse(readFileSync(resolve(observationPath), 'utf8')) as Parameters<typeof measureBenchmark>[0]
      const result = measureBenchmark(observation, fixture)
      if (flags.has('--text')) writeLines([formatBenchmarkText(result)])
      else writeJson(result)
      return result.regressions.length ? 1 : 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 2
    }
  }

  if (command === 'study') return runStudyCommand(flags, positional, argv)

  if (command === 'scan' || command === 'reconcile' || command === 'check' || command === 'map') {
    return runWorkflowCommand(command, flags, configPath, argv)
  }
  if (command === 'audit') return runDocumentationAuditCommand(flags, positional, configPath)

  if (command === 'fix') return runFixCommand(argv, positional, configPath)
  if (command === 'suggest') return runSuggestCommand(flags, configPath)

  if (command === 'init') {
    const root = process.cwd()
    const withDemo = flags.has('--demo') || !flags.has('--no-demo')
    const configFile = resolve(root, configPath ?? 'doc-bridge.config.json')
    const docsIndex = resolve(root, 'docs/for-agents/INDEX.md')
    const exampleDoc = resolve(root, 'docs/for-agents/packages/example.md')
    const agentsMd = resolve(root, 'AGENTS.md')
    const configWritten = writeIfMissing(configFile, initConfigContents(configFile, withDemo))
    const indexWritten = writeIfMissing(
      docsIndex,
      withDemo
        ? '# Agent docs index\n\n- [example](./packages/example.md) — starter ownership target\n'
        : '# Agent docs index\n\nStart here for ownership, architecture, and task handoffs.\n',
    )
    const exampleWritten = withDemo ? writeIfMissing(exampleDoc, exampleAgentDoc) : false
    const agentsWritten = writeIfMissing(agentsMd, agentsMdSnippet)
    if (withDemo) writeIfMissing(resolve(root, 'src/.gitkeep'), '')
    const scaffold = flags.has('--scaffold-workspaces')
      ? scaffoldWorkspaceDocs(root, loadProject(configFile).config)
      : undefined
    writeJson({
      ok: true,
      configPath: configFile,
      demo: withDemo,
      created: {
        config: configWritten,
        index: indexWritten,
        ...(withDemo ? { exampleDoc: exampleWritten, srcStub: true } : {}),
        agentsMd: agentsWritten,
        ...(scaffold ? { workspaceDocs: scaffold.created } : {}),
      },
      ...(scaffold ? { skipped: { workspaceDocs: scaffold.skipped } } : {}),
      nextCommands: withDemo
        ? ['ak-docs index', 'ak-docs query package example --agent', 'ak-docs list packages --text']
        : ['ak-docs index', 'ak-docs list knowledge --text'],
    })
    return 0
  }

  if (command === 'bootstrap') {
    if (positional[1] !== 'agent-docs') {
      process.stderr.write('Usage: ak-docs bootstrap agent-docs [--config <path>]\n')
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const result = bootstrapAgentDocs(root, config)
      writeJson({ ok: true, ...result })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'memory') {
    if (!['ingest', 'classify', 'promote'].includes(positional[1] ?? '')) {
      process.stderr.write(
        'Usage: ak-docs memory <ingest|classify|promote> [--pr] [--dry-run] [--force] [--config <path>]\n',
      )
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const candidates = ingestMemoryCandidates(root)
      if (positional[1] === 'ingest') {
        writeJson({ ok: true, count: candidates.length, candidates })
        return 0
      }
      const index = loadDocBridgeIndex(root, config)
      const classifications = classifyMemoryCandidates(candidates, index)
      if (positional[1] === 'classify') {
        writeJson({ ok: true, count: classifications.length, classifications })
        return 0
      }
      const draft = draftMemoryPromotion(classifications)
      if (flags.has('--pr') || flags.has('--github')) {
        const pr = promoteMemoryToGithubPr(root, draft, {
          dryRun: flags.has('--dry-run'),
          force: flags.has('--force'),
        })
        if (flags.has('--text')) {
          writeLines([
            pr.message,
            ...(pr.draftPath ? [`Draft: ${pr.draftPath}`] : []),
            ...(pr.prUrl ? [`PR: ${pr.prUrl}`] : []),
            ...(pr.commands.length ? ['', 'Commands:', ...pr.commands.map((cmd) => `  ${cmd}`)] : []),
          ])
        } else {
          writeJson({ ...draft, pr })
        }
        return pr.ok ? 0 : 1
      }
      writeJson(draft)
      return draft.ok ? 0 : 1
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'registry') {
    if (positional[1] !== 'topology') {
      process.stderr.write('Usage: ak-docs registry topology\n')
      return 1
    }
    writeJson(registryTopology())
    return 0
  }

  if (command === 'playbook') {
    const action = positional[1]
    if (action === 'pattern') {
      const payload = docBridgePatternPayload()
      if (flags.has('--text') || wantsTextOutput(flags, { schemaVersion: 1, corpus: { agent: { root: 'docs' } } } as DocBridgeConfigV1)) {
        process.stdout.write(`${docBridgePatternMarkdown()}\n`)
      } else {
        writeJson(payload)
      }
      return 0
    }
    if (action !== 'draft') {
      process.stderr.write('Usage: ak-docs playbook draft | pattern [--text] [--config <path>]\n')
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const index = loadDocBridgeIndex(root, config)
      const draft = draftMemoryPromotion(classifyMemoryCandidates(ingestMemoryCandidates(root), index))
      writeJson({
        ...draft,
        title: 'Draft Playbook feedback promotion',
        pattern: 'Doc Bridge Pattern',
        patternDoc: 'docs/playbook/doc-bridge-pattern.md',
        exportCommand: 'ak-docs playbook pattern --text',
      })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'index') {
    try {
      const { config, root, configPath: loadedConfigPath } = loadProject(configPath)
      if (flags.has('--watch')) {
        return watchDocBridgeIndex({
          root,
          config,
          configPath: loadedConfigPath,
        })
      }
      const result = buildDocBridgeIndex({ root, config })
      const diagnostics = indexDiagnostics(config, result)
      const handoffCount = Object.keys(result.index.handoffs ?? {}).length
      writeJson({
        ok: true,
        indexPath: result.indexPath,
        ...(result.llmsTxtPath ? { llmsTxtPath: result.llmsTxtPath } : {}),
        ...(result.capabilitiesPath ? { capabilitiesPath: result.capabilitiesPath } : {}),
        contentHash: result.index.contentHash,
        knowledgeCount: result.index.knowledge.length,
        packageCount: result.index.lookup?.packages.length ?? 0,
        handoffCount,
        ...(diagnostics.length ? { diagnostics } : {}),
        nextCommands: diagnosticNextCommands(config, result),
      })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'gate') {
    const action = positional[1]
    const gateId = positional[2] as GateId | undefined
    if (action !== 'run') {
      process.stderr.write('Usage: ak-docs gate run [gate-id]\n')
      return 1
    }
    if (gateId && !GATE_IDS.has(gateId)) {
      process.stderr.write(
        `Unsupported gate "${gateId}". Supported gates: ${[...GATE_IDS].join(', ')}\n`,
      )
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const result = runGates(root, config, gateId ? [gateId] : undefined)
      writeJson(result)
      return result.ok ? 0 : 1
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'rules') return runRulesCommand(argv, flags, positional, configPath)

  if (command === 'conformance') {
    const action = positional[1]
    const profile = positional[2]
    if (action !== 'run' || profile !== DOCUMENTATION_STANDARD_V1_ID) {
      process.stderr.write(`Usage: ak-docs conformance run ${DOCUMENTATION_STANDARD_V1_ID} [--text|--json]\n`)
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const report = runDocumentationStandardV1(root, config)
      if (wantsTextOutput(flags, config)) writeLines(formatDocumentationStandardText(report))
      else writeJson(report)
      return report.ok ? 0 : 1
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'mcp') {
    if (positional[1] === 'install') {
      const target = flags.has('--claude') ? 'claude' : flags.has('--cursor') ? 'cursor' : undefined
      if (!target) {
        process.stderr.write('Usage: ak-docs mcp install --cursor | --claude\n')
        return 1
      }
      try {
        const { config, root } = loadProject(configPath)
        const result = installMcpConfig(root, target)
        if (wantsTextOutput(flags, config)) {
          writeLines([
            `Installed MCP server "${result.serverName}" for ${result.target}`,
            `Config: ${result.configPath}`,
            ...(result.created ? ['Created new config file'] : ['Merged into existing config']),
            '',
            'Next steps:',
            ...result.nextSteps.map((step) => `  → ${step}`),
          ])
        } else {
          writeJson({ ...result, snippet: mcpSnippet(root) })
        }
        return 0
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 1
      }
    }

    try {
      const { config, root } = loadProject(configPath)
      startMcpStdioServer({ root, config })
      return undefined
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'doctor') {
    try {
      const { config, root } = loadProject(configPath)
      const report = runDoctor(root, config)
      if (flags.has('--write-badge')) {
        const badgePath = resolve(root, '.doc-bridge', 'coverage-badge.json')
        mkdirSync(dirname(badgePath), { recursive: true })
        writeFileSync(badgePath, `${formatDoctorBadgeJson(report.badge)}\n`, 'utf8')
      }
      if (flags.has('--badge')) {
        writeLines([formatDoctorBadgeMarkdown(report.badge)])
        return 0
      }
      if (wantsTextOutput(flags, config)) writeLines(formatDoctorText(report))
      else writeJson(report)
      return report.ok ? 0 : 1
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'demo') {
    const resolveDemoFixture = (): DemoFixture => {
      const fixtureFlagIndex = positional.indexOf('--fixture')
      if (fixtureFlagIndex >= 0) {
        const value = positional[fixtureFlagIndex + 1]
        if (value === 'monorepo' || value === 'example') return value
      }
      if (flags.has('--monorepo') || positional.includes('monorepo')) return 'monorepo'
      if (positional[1] === 'monorepo') return 'monorepo'
      return 'example'
    }
    const resolvedFixture = resolveDemoFixture()

    try {
      const useProject = flags.has('--in-project') || flags.has('--copy-fixture')
      if (!useProject) {
        const result = withDemoWorkspace(resolvedFixture, (root, config) =>
          runDemo(root, config, resolvedFixture),
        )
        const textMode =
          flags.has('--text') || (!flags.has('--json') && !flags.has('--agent'))
        if (textMode) writeLines(formatDemoText(result))
        else writeJson(result)
        return result.ok ? 0 : 1
      }

      const { config, root } = loadProject(configPath)
      const result = runDemo(root, config, resolvedFixture, { copyFixture: flags.has('--copy-fixture') })
      if (wantsTextOutput(flags, config)) writeLines(formatDemoText(result))
      else writeJson(result)
      return result.ok ? 0 : 1
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'query') {
    const maybeKind = positional[1] as QueryKind | undefined
    if (maybeKind === 'search') {
      process.stderr.write('Usage: ak-docs query [package|ownership|intent|change] <id> [--agent]\n')
      return 1
    }
    const kind = maybeKind && QUERY_KINDS.has(maybeKind) ? maybeKind : 'package'
    const id = kind === maybeKind ? positional[2] : positional[1]
    if (!id) {
      process.stderr.write('Usage: ak-docs query [package|ownership|intent|change] <id> [--agent]\n')
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const index = loadDocBridgeIndex(root, config)
      const result = runQuery(index, config, { kind, id, agent: flags.has('--agent') })
      if (wantsTextOutput(flags, config)) writeTextQuery(result)
      else writeJson(result)
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'search') {
    const term = positional.slice(1).join(' ').trim()
    if (!term) {
      process.stderr.write('Usage: ak-docs search <term> [--agent]\n')
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const index = loadDocBridgeIndex(root, config)
      if (flags.has('--agent')) {
        const result = runQuery(index, config, { kind: 'search', term, agent: true })
        writeJson(result)
      } else {
        const matches = searchIndex(index, term)
        if (wantsTextOutput(flags, config)) writeTextSearch(term, matches)
        else writeJson({ term, count: matches.length, matches })
      }
      return 0
    } catch (error) {
      if (error instanceof IndexNotFoundError) {
        process.stderr.write(`${error.message}\n`)
        return 1
      }
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'retrieve') {
    const query = positional.slice(1).join(' ').trim()
    if (!query) {
      process.stderr.write('Usage: ak-docs retrieve <query> [--config <path>]\n')
      return 1
    }
    return (async () => {
      try {
        const { config, root } = loadProject(configPath)
        const index = loadDocBridgeIndex(root, config)
        writeJson({ query, chunks: await retrieveHybridChunks(root, config, index, query) })
        return 0
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 1
      }
    })()
  }

  if (command === 'rag') {
    const action = positional[1]
    if (action !== 'ingest' && action !== 'search') {
      process.stderr.write('Usage: ak-docs rag ingest | ak-docs rag search <query>\n')
      return 1
    }
    return (async () => {
      try {
        const { config, root } = loadProject(configPath)
        const index = loadDocBridgeIndex(root, config)
        const rag = await createDocBridgeRag(root, config, index)
        if (action === 'ingest') {
          const result = await rag.ingest()
          writeJson({ ok: true, ...result })
          return 0
        }
        const query = positional.slice(2).join(' ').trim()
        if (!query) {
          process.stderr.write('Usage: ak-docs rag search <query>\n')
          return 1
        }
        const hits = await rag.search(query)
        writeJson({ query, count: hits.length, hits })
        return 0
      } catch (error) {
        if (error instanceof PeerMissingError) {
          process.stderr.write(`${error.message}\n`)
          return 1
        }
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 1
      }
    })()
  }

  if (command === 'chat') {
    return (async () => {
      try {
        const { config, root } = loadProject(configPath)
        if (!config.intelligence?.enabled || !config.intelligence.adapter) {
          process.stderr.write(
            'Chat requires intelligence.enabled and intelligence.adapter in doc-bridge config.\n' +
              `Layer 1 peers: ${layer1InstallHint()}\n`,
          )
          return 1
        }
        const index = loadDocBridgeIndex(root, config)
        await startInkChat(root, config, index)
        return 0
      } catch (error) {
        if (error instanceof PeerMissingError) {
          process.stderr.write(`${error.message}\n`)
          return 1
        }
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 1
      }
    })()
  }

  if (command === 'ask') {
    const question = positional.slice(1).join(' ').trim()
    try {
      const { config, root } = loadProject(configPath)
      if (flags.has('--chat')) {
        if (!config.intelligence?.enabled || !config.intelligence.adapter) {
          process.stderr.write(
            'Chat mode requires intelligence.enabled and intelligence.adapter in doc-bridge config.\n' +
              `Install peers: ${layer1InstallHint()}\n`,
          )
          return 1
        }
        if (!question) {
          process.stderr.write('Usage: ak-docs ask <question> --chat\n')
          return 1
        }
        return (async () => {
          try {
            const index = loadDocBridgeIndex(root, config)
            const result = await runChatOnce(root, config, index, question)
            writeLines([result.content])
            return 0
          } catch (error) {
            if (error instanceof PeerMissingError) {
              process.stderr.write(`${error.message}\n`)
              return 1
            }
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
            return 1
          }
        })()
      }
      if (!question) {
        if (process.stdin.isTTY) return runAskRepl(root, config)
        process.stderr.write('Usage: ak-docs ask <question>, or run ak-docs ask in an interactive terminal.\n')
        return 1
      }
      const index = loadDocBridgeIndex(root, config)
      writeAsk(question, searchIndex(index, question, 8), index, config)
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'list') {
    const kind = positional[1]
    if (!kind || !LIST_KINDS.has(kind)) {
      process.stderr.write('Usage: ak-docs list <packages|intents|changes|knowledge>\n')
      return 1
    }
    try {
      const { config, root } = loadProject(configPath)
      const index = loadDocBridgeIndex(root, config)

      if (kind === 'packages') {
        const items = index.lookup?.packages ?? []
        if (wantsTextOutput(flags, config)) writeLines(items)
        else writeJson({ kind, items })
        return 0
      }
      if (kind === 'intents') {
        const items = Object.keys(index.lookup?.intents ?? {})
        if (wantsTextOutput(flags, config)) writeLines(items)
        else writeJson({ kind, items })
        return 0
      }
      if (kind === 'changes') {
        const items = Object.keys(index.lookup?.changes ?? {})
        if (wantsTextOutput(flags, config)) writeLines(items)
        else writeJson({ kind, items })
        return 0
      }
      const items = index.knowledge.map((entry) => ({
        id: entry.id,
        title: entry.title,
        path: entry.path,
      }))
      if (wantsTextOutput(flags, config)) {
        writeLines(items.map((item) => [item.id, item.path, item.title].join('\t')))
      } else {
        writeJson({ kind, items })
      }
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  process.stdout.write(usage)
  return 1
}
