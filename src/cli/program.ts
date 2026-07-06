import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadConfig } from '../config/load-config.js'
import { parseAgentHandoff, parseDocBridgeConfig } from '../validate.js'
import { PACKAGE_VERSION } from '../version.js'

type Command = 'help' | 'version' | 'validate-config' | 'validate-handoff'

const usage = `ak-docs — agent-first documentation CLI (@agentskit/doc-bridge)

Usage:
  ak-docs --version
  ak-docs validate-config [--config <path>]
  ak-docs validate-handoff <file.json> [--config <path>]

Global flags:
  -h, --help
  --config <path>   Config file (default: auto-discover doc-bridge.config.json)
`

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

  return { command, flags, configPath, positional }
}

export const runCli = (argv: readonly string[]): number => {
  const { command, configPath, positional } = parseArgs(argv)

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
      process.stdout.write(JSON.stringify({ ok: true, path, schemaVersion: config.schemaVersion }, null, 2))
      process.stdout.write('\n')
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
      process.stdout.write(JSON.stringify({ ok: true, handoff }, null, 2))
      process.stdout.write('\n')
      return 0
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }

  process.stdout.write(usage)
  return 1
}