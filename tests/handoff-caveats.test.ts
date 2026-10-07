import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { AgentHandoffV1Schema, HandoffCaveatsSchema, normalizeAgentHandoff } from '../src/schemas/agent-handoff.js'
import { parseAgentHandoff } from '../src/validate.js'
import { handoffForEntity } from '../src/query/handoff.js'
import { runQuery } from '../src/query/query.js'
import { DocBridgeConfigV1Schema } from '../src/config/schema.js'
import { applyConfigDefaults } from '../src/config/defaults.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { handleMcpRequest } from '../src/mcp/server.js'

// Frozen strict field set of the pre-caveats reader; rejects the negotiated extension.
const oldReader = AgentHandoffV1Schema.omit({ caveats: true }).strict()
const oldHandoff = { type: 'agent-handoff', source: 'index.json', target: { type: 'package', id: 'fixture' }, startHere: 'guide.md', readBeforeEditing: [], editRoots: ['src'], checks: [], notes: [] }
const caveats = { pendingFindings: [{ id: 'finding-1', status: 'unresolved', routing: 'pending-version' as const }], analyzed: [{ repository: 'fixture', revision: 'r1' }], coverage: [{ scope: 'runtime', status: 'not-analyzed' as const, reason: 'No runtime evidence supplied' }] }
const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/sample-project')
const config = () => applyConfigDefaults(DocBridgeConfigV1Schema.parse(JSON.parse(readFileSync(join(fixtureRoot, 'doc-bridge.config.json'), 'utf8'))))

describe('handoff caveat capability negotiation', () => {
  it('new strict readers accept old payloads and round-trip negotiated caveats', () => {
    expect(AgentHandoffV1Schema.parse(oldHandoff).schemaVersion).toBe(1)
    const extended = normalizeAgentHandoff({ ...oldHandoff, caveats }, { includeCaveats: true })
    expect(parseAgentHandoff(extended)).toEqual(extended)
    expect(AgentHandoffV1Schema.parse(extended).caveats).toEqual(caveats)
    expect(oldReader.safeParse(extended).success).toBe(false)
    expect(oldReader.parse(normalizeAgentHandoff(extended)).caveats).toBeUndefined()
    expect(HandoffCaveatsSchema.safeParse({ ...caveats, pendingFindings: Array(33).fill(caveats.pendingFindings[0]) }).success).toBe(false)
  })
  it('new default writers remain readable by old strict readers, including real index and MCP embedding', () => {
    const configured = config(), index = buildDocBridgeIndex({ root: fixtureRoot, config: configured, write: false }).index
    for (const handoff of Object.values(index.handoffs ?? {})) { expect(oldReader.safeParse(handoff).success).toBe(true); expect(handoff.caveats).toBeUndefined() }
    const negotiated = handoffForEntity(index, 'os-core', configured, { includeCaveats: true, caveats })
    expect(parseAgentHandoff(negotiated).caveats).toEqual(caveats)
    expect(handoffForEntity(index, 'os-core', configured, { caveats }).caveats).toBeUndefined()
    expect(oldReader.safeParse(handoffForEntity(index, 'os-core', configured)).success).toBe(true)
    expect(oldReader.safeParse(runQuery(index, configured, { kind: 'ownership', id: 'os-core', agent: true })).success).toBe(true)
    const result = handleMcpRequest({ root: fixtureRoot, config: configured, loadIndex: () => index }, { method: 'tools/call', params: { name: 'handoff.resolve', arguments: { id: 'os-core' } } }) as { content: { text: string }[] }
    const embedded = JSON.parse(result.content[0]!.text)
    expect(oldReader.safeParse(embedded).success).toBe(true)
    expect(embedded.caveats).toBeUndefined()
    // A stored negotiated legacy handoff still cannot leak to a default query/MCP writer.
    const legacyIndex = { ...index, projection: undefined, handoffs: { ...index.handoffs, 'os-core': negotiated } }
    expect(handoffForEntity(legacyIndex, 'os-core', configured).caveats).toBeUndefined()
  })
})
