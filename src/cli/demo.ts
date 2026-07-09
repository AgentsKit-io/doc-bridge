import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { runGates } from '../gates/run-gates.js'
import { mcpSnippet } from '../mcp/install.js'
import { loadDocBridgeIndex } from '../query/load-index.js'
import { runQuery } from '../query/query.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'

export type DemoFixture = 'example' | 'monorepo'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const fixturePath = (fixture: DemoFixture): string => {
  if (fixture === 'monorepo') {
    return join(packageRoot, 'examples', 'demo-monorepo')
  }
  return join(packageRoot, 'examples', 'demo-example')
}

const formatHandoffText = (handoff: AgentHandoffV1): string[] => {
  const bridge =
    handoff.bridge?.humanDoc === 'missing'
      ? `human guide: missing → ${handoff.bridge.action ?? 'ak-docs bootstrap agent-docs'}`
      : handoff.humanDoc
        ? `human guide: ${handoff.humanDoc}`
        : 'human guide: (none)'

  return [
    `target:  ${handoff.target.id} (${handoff.target.path ?? 'n/a'})`,
    `start:   ${handoff.startHere}`,
    `edit:    ${handoff.editRoots.join(', ')}`,
    `checks:  ${handoff.checks.length ? handoff.checks.join(' · ') : '(none)'}`,
    bridge,
    ...(handoff.notes.length ? [`notes:   ${handoff.notes[0]}`] : []),
  ]
}

export type DemoResult = {
  readonly ok: boolean
  readonly fixture: DemoFixture
  readonly handoff: AgentHandoffV1
  readonly gateBefore: { readonly ok: boolean; readonly message: string }
  readonly gateAfter: { readonly ok: boolean; readonly message: string }
  readonly mcpSnippet: string
  readonly nextCommands: readonly string[]
}

export const runDemo = (
  root: string,
  config: DocBridgeConfigV1,
  fixture: DemoFixture = 'example',
  options: { readonly copyFixture?: boolean } = {},
): DemoResult => {
  const targetPackage = fixture === 'monorepo' ? 'auth' : 'example'
  const fixtureDir = fixturePath(fixture)

  if (options.copyFixture && existsSync(fixtureDir)) {
    for (const rel of ['doc-bridge.config.json', 'docs', 'packages', 'pnpm-workspace.yaml', 'package.json']) {
      const src = join(fixtureDir, rel)
      if (!existsSync(src)) continue
      const dest = join(root, rel)
      cpSync(src, dest, { recursive: true })
    }
  }

  const gateBeforeStale = runGates(root, config, ['index-freshness'])
  const beforeGate = gateBeforeStale.results[0] ?? { ok: false, message: 'index-freshness unavailable' }

  buildDocBridgeIndex({ root, config })
  const index = loadDocBridgeIndex(root, config)
  const handoff = runQuery(index, config, {
    kind: 'package',
    id: targetPackage,
    agent: true,
  }) as AgentHandoffV1

  const gateAfter = runGates(root, config, ['index-freshness'])
  const afterGate = gateAfter.results[0] ?? { ok: true, message: 'Index is fresh' }

  return {
    ok: afterGate.ok,
    fixture,
    handoff,
    gateBefore: { ok: beforeGate.ok, message: beforeGate.message },
    gateAfter: { ok: afterGate.ok, message: afterGate.message },
    mcpSnippet: mcpSnippet(root),
    nextCommands: [
      `ak-docs query package ${targetPackage} --agent`,
      'ak-docs doctor --text',
      'ak-docs mcp install --cursor',
      'ak-docs ask "where do I change auth?"',
    ],
  }
}

export const formatDemoText = (result: DemoResult): string[] => {
  const lines = [
    'ak-docs demo — AgentHandoff in 60s',
    '═'.repeat(44),
    '',
    'Before (agent guesses package)',
    '  ✗ edits packages/billing when task mentions "auth"',
    '  ✗ runs repo-wide test instead of package checks',
    '',
    'After (handoff.resolve / query --agent)',
    ...formatHandoffText(result.handoff).map((line) => `  ✓ ${line}`),
    '',
    `Gate: ${result.gateBefore.ok ? 'green' : 'red'} → ${result.gateAfter.ok ? 'green' : 'red'}`,
    `  before: ${result.gateBefore.message}`,
    `  after:  ${result.gateAfter.message}`,
    '',
    'MCP snippet (.cursor/mcp.json)',
    ...result.mcpSnippet.split('\n').map((line) => `  ${line}`),
    '',
    'Next',
    ...result.nextCommands.map((cmd) => `  → ${cmd}`),
  ]
  return lines
}

/** Ephemeral demo workspace for `ak-docs demo` without polluting cwd. */
export const withDemoWorkspace = (
  fixture: DemoFixture,
  fn: (root: string, config: DocBridgeConfigV1) => DemoResult,
): DemoResult => {
  const dir = mkdtempSync(join(tmpdir(), 'ak-docs-demo-'))
  try {
    const fixtureDir = fixturePath(fixture)
    if (!existsSync(fixtureDir)) {
      throw new Error(`Demo fixture "${fixture}" not found at ${fixtureDir}`)
    }
    cpSync(fixtureDir, dir, { recursive: true })
    const config = JSON.parse(readFileSync(join(dir, 'doc-bridge.config.json'), 'utf8')) as DocBridgeConfigV1
    return fn(dir, config)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}