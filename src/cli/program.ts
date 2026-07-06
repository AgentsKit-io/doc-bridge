import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadConfig, resolveProjectRoot } from '../config/load-config.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { IndexNotFoundError, loadDocBridgeIndex } from '../query/load-index.js'
import { runQuery, type QueryKind } from '../query/query.js'
import { searchIndex } from '../query/search.js'
import { parseAgentHandoff, parseDocBridgeConfig } from '../validate.js'
import { PACKAGE_VERSION } from '../version.js'

type Command =
  | 'help'
  | 'version'
  | 'validate-config'
  | 'validate-handoff'
  | 'index'
  | 'query'
  | 'search'
  | 'list'

const usage = `ak-docs — agent-first documentation CLI (@agentskit/doc-bridge)

Usage:
  ak-docs --version
  ak-docs validate-config [--config <path>]
  ak-docs validate-handoff <file.json> [--config <path>]
  ak-docs index [--config <path>]
  ak-docs query <kind> <id> [--agent] [--config <path>]
  ak-docs search <term> [--agent] [--config <path>]
  ak-docs list <kind> [--config <path>]

Query kinds: package | ownership | intent | change
List kinds: packages | intents | changes | knowledge

Global flags:
  -h, --help
  --config <path>   Config file (default: auto-discover doc-bridge.config.json)
  --agent           Emit AgentHandoff / AgentSearch JSON
`

const QUERY_KINDS = new Set<QueryKind>(['package', 'ownership', 'intent', 'change', 'search'])
const LIST_KINDS = new Set(['packages', 'intents', 'changes', 'knowledge'])

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
  else if (positional[0] === 'index') command = 'index'
  else if (positional[0] === 'query') command = 'query'
  else if (positional[0] === 'search') command = 'search'
  else if (positional[0] === 'list') command = 'list'

  return { command, flags, configPath, positional }
}

const writeJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

const loadProject = (configPath?: string) => {
  const loadOpts = configPath ? { explicitPath: configPath } : {}
  const { config, path } = loadConfig(loadOpts)
  parseDocBridgeConfig(config)
  const root = resolveProjectRoot()
  return { config, configPath: path, root }
}

export const runCli = (argv: readonly string[]): number => {
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

  if (command === 'index') {
    try {
      const { config, root } = loadProject(configPath)
      const result = buildDocBridgeIndex({ root, config })
      writeJson({
        ok: true,
        indexPath: result.indexPath,
        ...(result.llmsTxtPath ? { llmsTxtPath: result.llmsTxtPath } : {}),
        contentHash: result.index.contentHash,
        knowledgeCount: result.index.knowledge.length,
        packageCount: result.index.lookup?.packages.length ?? 0,
      })
      return 0
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
      writeJson(result)
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
        writeJson({ term, count: matches.length, matches })
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
        writeJson({ kind, items: index.lookup?.packages ?? [] })
        return 0
      }
      if (kind === 'intents') {
        writeJson({ kind, items: Object.keys(index.lookup?.intents ?? {}) })
        return 0
      }
      if (kind === 'changes') {
        writeJson({ kind, items: Object.keys(index.lookup?.changes ?? {}) })
        return 0
      }
      writeJson({
        kind,
        items: index.knowledge.map((entry) => ({
          id: entry.id,
          title: entry.title,
          path: entry.path,
        })),
      })
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  process.stdout.write(usage)
  return 1
}