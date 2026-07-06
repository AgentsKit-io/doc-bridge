import { describe, expect, it } from 'vitest'

import { defineConfig } from '../src/config/define-config.js'
import { normalizeAgentHandoff } from '../src/schemas/agent-handoff.js'
import { safeParseAgentHandoff } from '../src/validate.js'
import { parseDocBridgeIndex } from '../src/validate.js'

const akosLegacyHandoff = {
  type: 'agent-handoff',
  source: 'docs/internal/index.generated.json',
  target: { type: 'package', id: 'os-core', path: 'packages/os-core', group: 'Contracts', layer: 'L1' },
  startHere: 'docs/for-agents/packages/os-core.md',
  readBeforeEditing: [
    'docs/for-agents/packages/os-core.md',
    'packages/os-core/README.md',
    'AGENTS.md',
  ],
  editRoots: ['packages/os-core'],
  checks: ['pnpm --filter os-core lint', 'pnpm --filter os-core test'],
  notes: ['Zod schemas + event bus + error model'],
}

describe('AgentHandoff v1', () => {
  it('normalizes AKOS legacy payload without schemaVersion', () => {
    const handoff = normalizeAgentHandoff(akosLegacyHandoff)
    expect(handoff.schemaVersion).toBe(1)
    expect(handoff.target.id).toBe('os-core')
    expect(handoff.editRoots).toEqual(['packages/os-core'])
  })

  it('rejects invalid handoff type', () => {
    const result = safeParseAgentHandoff({ ...akosLegacyHandoff, type: 'nope' })
    expect(result.ok).toBe(false)
  })
})

describe('DocBridgeIndex v1', () => {
  it('parses minimal index', () => {
    const index = parseDocBridgeIndex({
      schemaVersion: 1,
      contentHash: 'a'.repeat(64),
      contentHashAlgo: 'sha256-normalized-v1',
      knowledge: [
        {
          id: 'auth',
          type: 'module',
          title: 'Auth module',
          path: 'docs/for-agents/modules/auth.md',
        },
      ],
    })
    expect(index.knowledge).toHaveLength(1)
  })
})

describe('DocBridgeConfig v1', () => {
  it('applies defaults via defineConfig', () => {
    const config = defineConfig({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs' } },
    })
    expect(config.corpus.agent.index).toBe('docs/INDEX.md')
    expect(config.index?.outFile).toBe('.doc-bridge/index.json')
    expect(config.surfaces?.cli?.bin).toBe('ak-docs')
    expect(config.intelligence?.enabled).toBe(false)
  })
})