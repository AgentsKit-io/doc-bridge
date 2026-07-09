import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { loadConfig, projectRootFromConfigPath } from '../config/load-config.js'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { discoverPnpmPackages } from '../index-builder/plugins/pnpm-monorepo.js'
import { scanHumanDocRecords } from '../index-builder/human-adapters/index.js'
import { retrieveHybridChunks } from '../federation/llms.js'
import { runGates, type GateId } from '../gates/run-gates.js'
import { runChatOnce, startInkChat } from '../intelligence/chat.js'
import { PeerMissingError, layer1InstallHint } from '../intelligence/peers.js'
import { createDocBridgeRag } from '../intelligence/rag.js'
import { firstHeading, firstParagraph } from '../lib/markdown.js'
import { ingestMemoryCandidates } from '../memory/ingest.js'
import { classifyMemoryCandidates, draftMemoryPromotion } from '../memory/pipeline.js'
import { startMcpStdioServer } from '../mcp/server.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'
import { runQuery, type QueryKind } from '../query/query.js'
import { searchIndex } from '../query/search.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import { parseAgentHandoff, parseDocBridgeConfig } from '../validate.js'
import { PACKAGE_VERSION } from '../version.js'

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
  | 'index'
  | 'gate'
  | 'mcp'
  | 'query'
  | 'search'
  | 'retrieve'
  | 'ask'
  | 'chat'
  | 'rag'
  | 'list'

const usage = `ak-docs — human↔agent documentation bridge (@agentskit/doc-bridge)

Core (no API key):
  ak-docs init [--demo] [--scaffold-workspaces]
  ak-docs index
  ak-docs query <package|ownership|intent|change> <id> [--agent] [--text]
  ak-docs search <term> [--agent] [--text]
  ak-docs list <packages|intents|changes|knowledge> [--text]
  ak-docs ask [question]          local consult (no LLM)
  ak-docs gate run [gate-id]
  ak-docs mcp
  ak-docs memory ingest|classify|promote
  ak-docs bootstrap agent-docs
  ak-docs validate-config | validate-handoff <file>

Intelligence (optional AgentsKit peers):
  ak-docs rag ingest|search <query>
  ak-docs chat                    terminal chat (Ink + RAG)
  ak-docs ask <question> --chat   one-shot grounded answer

Advanced / ecosystem:
  ak-docs retrieve <query>
  ak-docs registry topology
  ak-docs playbook draft

Global flags:
  -h, --help   --version
  --config <path>   (project root = config file directory)
  --agent   --json   --text   --chat   --demo
`

const QUERY_KINDS = new Set<QueryKind>(['package', 'ownership', 'intent', 'change', 'search'])
const LIST_KINDS = new Set(['packages', 'intents', 'changes', 'knowledge'])
const GATE_IDS = new Set<GateId>(['index-freshness', 'human-guide-links', 'okf-type', 'docs-style'])

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
  else if (positional[0] === 'index') command = 'index'
  else if (positional[0] === 'gate') command = 'gate'
  else if (positional[0] === 'mcp') command = 'mcp'
  else if (positional[0] === 'query') command = 'query'
  else if (positional[0] === 'search') command = 'search'
  else if (positional[0] === 'retrieve') command = 'retrieve'
  else if (positional[0] === 'ask') command = 'ask'
  else if (positional[0] === 'chat') command = 'chat'
  else if (positional[0] === 'rag') command = 'rag'
  else if (positional[0] === 'list') command = 'list'

  return { command, flags, configPath, positional }
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

const writeAsk = (
  question: string,
  matches: ReturnType<typeof searchIndex>,
  index: DocBridgeIndexV1,
): void => {
  // Prefer ownership match for routing questions
  const owner =
    matches.find((match) => match.type === 'ownership') ??
    matches.find((match) => Boolean(index.lookup?.ownership?.[match.id]))
  const best = owner ?? matches[0]
  const bestQuery =
    best && (best.type === 'ownership' || index.lookup?.ownership?.[best.id])
      ? `ak-docs query ownership ${best.id} --agent`
      : 'ak-docs list knowledge --text'
  writeLines([
    `Question: ${question}`,
    best ? `Best match: ${best.type} ${best.id} (${best.path})` : 'Best match: none',
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
        ]
      : ['ak-docs list knowledge --text']),
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
          writeAsk(line, searchIndex(index, line, 8), index)
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

const writeIfMissing = (path: string, contents: string): boolean => {
  if (existsSync(path)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
  return true
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
      process.stderr.write('Usage: ak-docs memory <ingest|classify|promote> [--config <path>]\n')
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
    if (positional[1] !== 'draft') {
      process.stderr.write('Usage: ak-docs playbook draft [--config <path>]\n')
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
      })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'index') {
    try {
      const { config, root } = loadProject(configPath)
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
      process.stderr.write('Usage: ak-docs gate run [index-freshness]\n')
      return 1
    }
    if (gateId && !GATE_IDS.has(gateId)) {
      process.stderr.write(
        `Unsupported gate "${gateId}". Supported gates: index-freshness, human-guide-links, okf-type, docs-style\n`,
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

  if (command === 'mcp') {
    try {
      const { config, root } = loadProject(configPath)
      startMcpStdioServer({ root, config })
      return undefined
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  if (command === 'query') {
    const kind = positional[1] as QueryKind | undefined
    const id = positional[2]
    if (!kind || !QUERY_KINDS.has(kind) || kind === 'search') {
      process.stderr.write('Usage: ak-docs query <package|ownership|intent|change> <id> [--agent]\n')
      return 1
    }
    if (!id) {
      process.stderr.write(`Missing id for query kind "${kind}".\n`)
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
      writeAsk(question, searchIndex(index, question, 8), index)
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
