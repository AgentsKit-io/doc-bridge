import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '../src/config/define-config.js'
import { loadConfig, resolveProjectRoot } from '../src/config/load-config.js'
import { parseStaticJsObject } from '../src/lib/static-js-literal.js'
import { normalizeAgentHandoff } from '../src/schemas/agent-handoff.js'
import { DocBridgeJsonSchemas } from '../src/schemas/json-schemas.js'
import { safeParseAgentHandoff } from '../src/validate.js'
import { parseAgentSearch, parseDocBridgeConfig } from '../src/validate.js'
import { parseDocBridgeIndex } from '../src/validate.js'
import { parseMemoryCandidate } from '../src/validate.js'
import { canonicalJsonV1, contentHashForArtifactV1, sha256NormalizedV1 } from '../src/index-builder/content-hash.js'
import {
  AgentProposalV1Schema,
  DiscoverySnapshotV1Schema,
  FixProposalV1Schema,
  ReconciliationReportV1Schema,
  WorkflowRunV1Schema,
} from '../src/schemas/knowledge.js'

const legacyHandoff = {
  type: 'agent-handoff',
  source: '.doc-bridge/index.json',
  target: { type: 'module', id: 'auth', path: 'src/auth', group: 'Platform', layer: 'app' },
  startHere: 'docs/for-agents/modules/auth.md',
  readBeforeEditing: [
    'docs/for-agents/modules/auth.md',
    'docs/human/auth.md',
    'AGENTS.md',
  ],
  editRoots: ['src/auth'],
  checks: ['npm test -- auth'],
  notes: ['Auth owns login and session refresh.'],
}

describe('AgentHandoff v1', () => {
  it('normalizes legacy payload without schemaVersion', () => {
    const handoff = normalizeAgentHandoff(legacyHandoff)
    expect(handoff.schemaVersion).toBe(1)
    expect(handoff.target.id).toBe('auth')
    expect(handoff.editRoots).toEqual(['src/auth'])
  })

  it('rejects invalid handoff type', () => {
    const result = safeParseAgentHandoff({ ...legacyHandoff, type: 'nope' })
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

describe('MemoryCandidate v1', () => {
  it('parses normalized memory candidate shape', () => {
    const candidate = parseMemoryCandidate({
      schemaVersion: 1,
      id: 'auth-abort-signal',
      source: 'cursor',
      rawPath: '.cursor/rules/auth.md',
      fact: 'Auth handlers must forward AbortSignal.',
      why: 'Run cancellation must stop network work.',
      howToApply: 'Use AbortSignal.any([caller, AbortSignal.timeout(ms)]).',
      suggestedType: 'project',
      confidence: 0.8,
      references: ['docs/for-agents/auth.md'],
    })

    expect(candidate.id).toBe('auth-abort-signal')
  })
})

describe('JSON Schema exports', () => {
  it('exports versioned portable schemas for core artifacts', () => {
    expect(DocBridgeJsonSchemas.agentHandoffV1.$id).toContain('agent-handoff-v1')
    expect(DocBridgeJsonSchemas.docBridgeIndexV1.$id).toContain('doc-bridge-index-v1')
    expect(DocBridgeJsonSchemas.memoryCandidateV1.$id).toContain('memory-candidate-v1')
    expect(DocBridgeJsonSchemas.agentHandoffV1.required).toContain('startHere')
    expect(DocBridgeJsonSchemas.docBridgeIndexV1.required).toContain('contentHash')
    expect(DocBridgeJsonSchemas.memoryCandidateV1.required).toContain('fact')
  })
})

const artifactMetadata = {
  schemaVersion: 1,
  contentHash: 'a'.repeat(64),
  contentHashAlgo: 'sha256-normalized-v1',
  project: { name: 'fixture' },
  sourceRevision: 'b'.repeat(40),
  sourceRevisionKind: 'git' as const,
  configurationHash: 'c'.repeat(64),
  pipelineVersion: '1.0.0',
  analyzerVersions: { 'js-ts': '1.0.0' },
}

const evidence = [{ source: 'code' as const, path: 'src/index.ts', lineStart: 1, lineEnd: 2 }]

describe('Knowledge Engine v1 artifacts', () => {
  it('parses the five versioned artifact envelopes', () => {
    const snapshot = DiscoverySnapshotV1Schema.parse({
      type: 'discovery-snapshot',
      ...artifactMetadata,
      entities: [{ id: 'module:src/index', kind: 'module', name: 'index', provenance: 'observed', evidence }],
      relations: [],
      coverage: [{ analyzer: 'js-ts', scope: 'imports', status: 'complete' }],
    })

    const report = ReconciliationReportV1Schema.parse({
      type: 'reconciliation-report',
      ...artifactMetadata,
      snapshotHash: 'a'.repeat(64),
      diagnostics: [],
      summary: { entityCount: 1, relationCount: 0, diagnosticCount: 0 },
    })

    expect(
      WorkflowRunV1Schema.parse({
        type: 'workflow-run',
        ...artifactMetadata,
        runId: 'run-1',
        state: 'created',
        steps: [],
        transitions: [],
        artifactRefs: [],
      }).state,
    ).toBe('created')

    expect(
      AgentProposalV1Schema.parse({
        type: 'agent-proposal',
        ...artifactMetadata,
        proposalId: 'proposal-1',
        baseSnapshotHash: snapshot.contentHash,
        baseReportHash: report.contentHash,
        relatedDiagnosticIds: [],
        rationale: 'Review this relation.',
        confidence: 0.8,
        evidence,
        intendedChanges: ['Add a declaration.'],
        origin: { kind: 'registry-agent', id: 'example-agent', version: '1.0.0', provider: 'agentskit', model: 'fixture', capabilities: ['snapshot.read'] },
        checks: ['pnpm test'],
      }).proposalId,
    ).toBe('proposal-1')

    expect(
      FixProposalV1Schema.parse({
        type: 'fix-proposal',
        ...artifactMetadata,
        proposalId: 'fix-1',
        baseRevision: artifactMetadata.sourceRevision,
        affectedFiles: [{ path: 'docs/index.md', contentHash: 'd'.repeat(64) }],
        preconditions: ['The target exists.'],
        diff: '--- a/docs/index.md\n+++ b/docs/index.md',
        postconditions: ['The link resolves.'],
        status: 'proposed',
      }).status,
    ).toBe('proposed')
  })

  it('preserves unknown namespaced kinds and rejects invalid evidence ranges', () => {
    const parsed = DiscoverySnapshotV1Schema.parse({
      type: 'discovery-snapshot',
      ...artifactMetadata,
      entities: [
        { id: 'vendor:service', kind: 'vendor.external-service', name: 'service', provenance: 'declared', evidence: [] },
      ],
      relations: [
        { id: 'r1', kind: 'vendor.calls', from: 'vendor:service', to: 'module:src/index', provenance: 'declared', evidence: [] },
      ],
      coverage: [],
    })
    expect(parsed.entities[0]?.kind).toBe('vendor.external-service')
    expect(() =>
      DiscoverySnapshotV1Schema.parse({
        type: 'discovery-snapshot',
        ...artifactMetadata,
        entities: [
          {
            id: 'module:a',
            kind: 'module',
            name: 'a',
            provenance: 'observed',
            evidence: [{ source: 'code', path: 'a.ts', lineStart: 3, lineEnd: 2 }],
          },
        ],
        relations: [],
        coverage: [],
      }),
    ).toThrow()
  })

  it('canonicalizes object keys and produces stable hashes', () => {
    const first = { relation: { to: 'module:b', from: 'module:a' }, entities: ['module:a', 'module:b'] }
    const second = { entities: ['module:a', 'module:b'], relation: { from: 'module:a', to: 'module:b' } }

    expect(canonicalJsonV1(first)).toBe(canonicalJsonV1(second))
    expect(sha256NormalizedV1(first)).toBe(sha256NormalizedV1(second))
    expect(sha256NormalizedV1(first)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('hashes an artifact without including its existing contentHash field', () => {
    const artifact = {
      ...artifactMetadata,
      type: 'discovery-snapshot' as const,
      entities: [],
      relations: [],
      coverage: [],
    }
    const expected = sha256NormalizedV1({ ...artifact, contentHash: undefined })
    expect(contentHashForArtifactV1(artifact)).toBe(expected)
  })

  it('rejects duplicate entity and relation IDs', () => {
    expect(() =>
      DiscoverySnapshotV1Schema.parse({
        type: 'discovery-snapshot',
        ...artifactMetadata,
        entities: [
          { id: 'module:a', kind: 'module', name: 'a', provenance: 'observed', evidence: [] },
          { id: 'module:a', kind: 'module', name: 'renamed-a', provenance: 'observed', evidence: [] },
        ],
        relations: [
          { id: 'relation:a', kind: 'imports', from: 'module:a', to: 'module:b', provenance: 'observed', evidence: [] },
          { id: 'relation:a', kind: 'imports', from: 'module:b', to: 'module:a', provenance: 'observed', evidence: [] },
        ],
        coverage: [],
      }),
    ).toThrow()
  })

  it('requires traceable origins and approvals for promoted proposals', () => {
    expect(() =>
      AgentProposalV1Schema.parse({
        type: 'agent-proposal',
        ...artifactMetadata,
        proposalId: 'proposal-2',
        baseSnapshotHash: 'a'.repeat(64),
        baseReportHash: 'a'.repeat(64),
        relatedDiagnosticIds: [],
        rationale: 'Missing origin id.',
        confidence: 0.5,
        evidence: [],
        intendedChanges: ['Review manually.'],
        origin: { kind: 'registry-agent' },
        checks: [],
      }),
    ).toThrow()

    expect(() =>
      FixProposalV1Schema.parse({
        type: 'fix-proposal',
        ...artifactMetadata,
        proposalId: 'fix-2',
        baseRevision: artifactMetadata.sourceRevision,
        affectedFiles: [],
        preconditions: [],
        diff: '--- a/file\n+++ b/file',
        postconditions: [],
        status: 'approved',
      }),
    ).toThrow()
  })
})

describe('DocBridgeConfig v1', () => {
  it('parses minimal config through public validator', () => {
    const config = parseDocBridgeConfig({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs' } },
    })
    expect(config.schemaVersion).toBe(1)
  })

  it('accepts registry and memory MCP tools in config', () => {
    const config = parseDocBridgeConfig({
      schemaVersion: 1,
      corpus: { agent: { root: 'docs' } },
      surfaces: {
        mcp: {
          tools: ['retriever.query', 'memory.classify', 'memory.promoteDraft', 'registry.topology'],
        },
      },
    })
    expect(config.surfaces?.mcp?.tools).toContain('registry.topology')
  })

  it('accepts VitePress and Starlight human corpora', () => {
    const config = parseDocBridgeConfig({
      schemaVersion: 1,
      corpus: {
        agent: { root: 'docs/for-agents' },
        human: [
          { plugin: 'vitepress', options: { docsDir: 'docs', cleanUrls: true } },
          { plugin: 'starlight', options: { contentDir: 'src/content/docs' } },
        ],
      },
    })

    expect(Array.isArray(config.corpus.human)).toBe(true)
  })

  it('formats config validation errors for humans', () => {
    expect(() => parseDocBridgeConfig({ schemaVersion: 1, corpus: { agent: {} } })).toThrow(
      'Invalid doc-bridge config:\n  - corpus.agent.root: Required',
    )
  })

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

  it('loads package.json docBridge config', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-pkg-config-'))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'pkg-config',
        docBridge: {
          schemaVersion: 1,
          corpus: { agent: { root: 'agent-docs' } },
        },
      }),
    )

    const { config, path } = loadConfig({ cwd: root })
    expect(path.endsWith('package.json')).toBe(true)
    expect(config.corpus.agent.index).toBe('agent-docs/INDEX.md')
    expect(resolveProjectRoot(join(root, 'nested'))).toBe(root)
  })

  it('loads static TypeScript config', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-ts-config-'))
    writeFileSync(
      join(root, 'doc-bridge.config.ts'),
      [
        "import { defineConfig } from '@agentskit/doc-bridge/config'",
        '',
        'export default defineConfig({',
        '  schemaVersion: 1,',
        "  corpus: { agent: { root: 'agent-docs' } },",
        '})',
        '',
      ].join('\n'),
    )

    const { config, path } = loadConfig({ cwd: root })
    expect(path.endsWith('doc-bridge.config.ts')).toBe(true)
    expect(config.corpus.agent.index).toBe('agent-docs/INDEX.md')
  })

  it('loads code configs without executing repository JavaScript', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-docs-static-config-'))
    delete process.env.AK_DOCS_CONFIG_EXECUTED
    writeFileSync(
      join(root, 'doc-bridge.config.js'),
      [
        'this.constructor.constructor("return process")().env.AK_DOCS_CONFIG_EXECUTED = "yes"',
        'export default { schemaVersion: 1, corpus: { agent: { root: "agent-docs" } } }',
      ].join('\n'),
    )

    expect(loadConfig({ cwd: root }).config.schemaVersion).toBe(1)
    expect(process.env.AK_DOCS_CONFIG_EXECUTED).toBeUndefined()
    writeFileSync(join(root, 'doc-bridge.config.js'), 'export default buildConfig()')
    expect(() => loadConfig({ cwd: root })).toThrow('static')
  })

  it('parses the supported static JavaScript literal primitives', () => {
    expect(parseStaticJsObject('/* static */ export default { yes: true, no: false, empty: null, count: -1.5, text: "a\\n" }')).toEqual({
      yes: true,
      no: false,
      empty: null,
      count: -1.5,
      text: 'a\n',
    })
  })

  it('reports config loading failures clearly', () => {
    const missing = mkdtempSync(join(tmpdir(), 'ak-docs-missing-config-'))
    expect(() => loadConfig({ cwd: missing })).toThrow('No doc-bridge config found')
    expect(resolveProjectRoot(missing)).toBe(missing)

    const badJson = mkdtempSync(join(tmpdir(), 'ak-docs-bad-json-'))
    writeFileSync(join(badJson, 'doc-bridge.config.json'), '{')
    expect(() => loadConfig({ cwd: badJson })).toThrow('Failed to parse JSON config')

    const yaml = mkdtempSync(join(tmpdir(), 'ak-docs-yaml-config-'))
    writeFileSync(join(yaml, 'doc-bridge.config.yaml'), 'schemaVersion: 1\n')
    expect(() => loadConfig({ cwd: yaml })).toThrow('YAML config is not supported yet')

    const unsupportedImport = mkdtempSync(join(tmpdir(), 'ak-docs-import-config-'))
    writeFileSync(
      join(unsupportedImport, 'doc-bridge.config.ts'),
      "import fs from 'node:fs'\nexport default { schemaVersion: 1, corpus: { agent: { root: 'docs' } } }\n",
    )
    expect(() => loadConfig({ cwd: unsupportedImport })).toThrow('Unsupported import')
  })
})

describe('AgentSearch v1', () => {
  it('parses public agent search payloads', () => {
    const search = parseAgentSearch({
      type: 'agent-search',
      schemaVersion: 1,
      source: '.doc-bridge/index.json',
      term: 'auth',
      count: 0,
      bestMatch: null,
      matches: [],
      nextCommands: ['ak-docs list knowledge --text'],
    })
    expect(search.term).toBe('auth')
  })
})
