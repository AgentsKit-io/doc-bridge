import { describe, expect, it } from 'vitest'

import {
  createHistoricalEvidenceRegistry,
  createStudyProtocol,
  formatHistoricalEvidenceText,
  formatStudyProtocolText,
  parseHistoricalEvidenceRegistry,
  parseStudyProtocol,
  validateHistoricalEvidenceRegistry,
} from '../src/study/protocol.js'

const metric = (id: string) => ({ id, family: 'discovery' as const, unit: 'count' as const, source: 'runner' as const, required: true, description: `Metric ${id}` })

const protocolInput = () => ({
  type: 'study-protocol' as const,
  schemaVersion: 1 as const,
  protocolVersion: 'v1',
  title: 'Documentation quality and agent efficiency study',
  evidenceClasses: ['historical', 'controlled'] as const,
  repositories: [
    { id: 'consumer-01', visibility: 'anonymized' as const, role: 'consumer' as const },
    { id: 'consumer-02', visibility: 'anonymized' as const, role: 'consumer' as const },
  ],
  taskCategories: ['discovery', 'architecture', 'documentation', 'implementation'] as const,
  models: [
    { id: 'low-cost-model', role: 'low-cost' as const, status: 'planned' as const },
    { id: 'reference-model', role: 'reference' as const, status: 'planned' as const },
  ],
  scenarios: [
    { id: 'repository-only', label: 'Repository only', source: 'repository-only' as const, modelIds: ['low-cost-model', 'reference-model'], requiresHumanApproval: true },
    { id: 'deterministic-doc-bridge', label: 'Deterministic Doc Bridge', source: 'deterministic-doc-bridge' as const, modelIds: ['low-cost-model', 'reference-model'], requiresHumanApproval: true },
    { id: 'registry-assisted', label: 'Doc Bridge plus Registry agent', source: 'doc-bridge-registry-agent' as const, modelIds: ['low-cost-model', 'reference-model'], registryAgent: 'configured' as const, requiresHumanApproval: true },
  ],
  metrics: [metric('task-success'), metric('tokens-to-answer')],
  outcomes: [{ id: 'protocol-integrity', statement: 'The study protocol is valid and reproducible.', checks: [{ id: 'protocol-validation', command: 'ak-docs study protocol protocol.json --json' }] }],
  budget: { maxTokensPerTask: 10_000, maxRuntimeMsPerTask: 120_000, maxRuns: 144, maxNetworkRequests: 0 },
  privacy: { mode: 'anonymized' as const, forbiddenFields: ['repository-content', 'paths', 'prompts', 'credentials', 'private-identifiers', 'raw-agent-responses'] as const, publicationRequiresHumanReview: true as const },
  stopping: { minControlledRounds: 3, consecutiveNoMaterialImprovementRounds: 3, targets: [{ metricId: 'tokens-to-answer', direction: 'decrease' as const, threshold: 0.25 }] },
})

describe('study protocol contracts', () => {
  it('creates and validates a deterministic protocol with cross-references', () => {
    const protocol = createStudyProtocol(protocolInput())
    expect(parseStudyProtocol(protocol)).toEqual(protocol)
    expect(formatStudyProtocolText(protocol)).toContain(`Repositories: 2`)
  })

  it('rejects unknown scenario models and missing Registry configuration', () => {
    expect(() => createStudyProtocol({ ...protocolInput(), scenarios: [{ ...protocolInput().scenarios[0], modelIds: ['missing-model'] }, ...protocolInput().scenarios.slice(1)] })).toThrow('unknown model')
    expect(() => createStudyProtocol({ ...protocolInput(), scenarios: protocolInput().scenarios.map((scenario) => scenario.source === 'doc-bridge-registry-agent' ? { ...scenario, registryAgent: 'none' as const } : scenario) })).toThrow('requires a configured Registry agent')
  })

  it('rejects tampered protocol hashes and unsafe public text', () => {
    const protocol = createStudyProtocol(protocolInput())
    expect(() => parseStudyProtocol({ ...protocol, contentHash: 'a'.repeat(64) })).toThrow('Invalid content hash')
    expect(() => createStudyProtocol({ ...protocolInput(), title: 'file:///private/project' })).toThrow('Public study text')
  })

  it('rejects outcomes without an executable check or explicit N/A reason', () => {
    expect(() => createStudyProtocol({ ...protocolInput(), outcomes: [{ id: 'unmapped-outcome', statement: 'This outcome has no evidence mapping.', checks: [] }] })).toThrow('executable check')
    expect(() => createStudyProtocol({ ...protocolInput(), outcomes: [{ id: 'not-applicable-outcome', statement: 'This outcome is outside Phase 0.', checks: [], notApplicableReason: 'Deferred to a later study phase.' }] })).not.toThrow()
  })
})

describe('historical evidence registry', () => {
  it('preserves explicit missing measurements and validates consumer references', () => {
    const protocol = createStudyProtocol(protocolInput())
    const registry = createHistoricalEvidenceRegistry({
      type: 'historical-evidence-registry',
      schemaVersion: 1,
      registryVersion: 'v1',
      records: [{
        id: 'historical-round-01',
        evidenceClass: 'historical',
        observedAt: '2026-08-29T00:00:00.000Z',
        subject: { kind: 'consumer', id: 'consumer-01' },
        source: { kind: 'validation-plan', reference: 'validation-cycle-plan' },
        status: 'partially-validated',
        metrics: { documents: 10 },
        missingMetrics: [{ metricId: 'tokens-to-answer', status: 'not-analyzed', reason: 'Not collected in this round.' }],
        limitations: ['Historical evidence is observational and not causal.'],
      }],
    })
    expect(() => validateHistoricalEvidenceRegistry(registry, protocol)).not.toThrow()
    expect(formatHistoricalEvidenceText(registry)).toContain('Missing measurements: 1')
    expect(parseHistoricalEvidenceRegistry(registry)).toEqual(registry)
    expect(() => validateHistoricalEvidenceRegistry(registry, createStudyProtocol({ ...protocolInput(), repositories: [protocolInput().repositories[1]] }))).toThrow('unknown consumer')
  })

  it('allows an empty registry but rejects records without metrics or limitations of absence', () => {
    expect(createHistoricalEvidenceRegistry({ type: 'historical-evidence-registry', schemaVersion: 1, registryVersion: 'v1', records: [] }).records).toEqual([])
    expect(() => createHistoricalEvidenceRegistry({
      type: 'historical-evidence-registry', schemaVersion: 1, registryVersion: 'v1', records: [{ id: 'empty-record', evidenceClass: 'historical', observedAt: '2026-08-29T00:00:00.000Z', subject: { kind: 'consumer', id: 'consumer-01' }, source: { kind: 'benchmark', reference: 'baseline' }, status: 'not-analyzed', metrics: {}, missingMetrics: [], limitations: ['No data.'] }],
    })).toThrow('metrics')
  })
})
