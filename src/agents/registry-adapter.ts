import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { AgentProposalV1Schema, type AgentProposalV1, type DiscoverySnapshotV1, type ReconciliationReportV1 } from '../schemas/knowledge.js'
import { contentHashForArtifactV1 } from '../index-builder/content-hash.js'
import { containedPath, redactValue } from '../safety/repository.js'

export const DEFAULT_REGISTRY_AGENT_ID = 'ecosystem-doc-bridge-corpus-scanner'

const RegistryAgentMetadataSchema = z.object({
  id: z.string().min(1).max(256),
  version: z.string().min(1).max(64),
  provider: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional(),
  capabilities: z.array(z.string().min(1).max(128)).max(32).default([]),
}).strict()

export type RegistryAgentMetadata = z.infer<typeof RegistryAgentMetadataSchema> & { readonly root: string }

export type RegistryAgentContext = {
  readonly snapshot: DiscoverySnapshotV1
  readonly report: ReconciliationReportV1
  readonly evidence: readonly ReconciliationReportV1['diagnostics'][number]['evidence'][number][]
  readonly capabilities: readonly ['snapshot.read', 'evidence.read', 'proposal.write']
  readonly network: false
  readonly shell: false
}

export type RegistryAgentRunner = (context: RegistryAgentContext) => Promise<unknown> | unknown

export type RegistryAgentAdapter = {
  readonly metadata: RegistryAgentMetadata
  readonly run: (snapshot: DiscoverySnapshotV1, report: ReconciliationReportV1, evidence?: readonly RegistryAgentContext['evidence'][number][]) => Promise<AgentProposalV1>
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

const registryConfig = (config: DocBridgeConfigV1) => config.intelligence?.registry

export const loadRegistryAgentRunner = async (root: string, config: DocBridgeConfigV1): Promise<RegistryAgentRunner> => {
  const metadata = loadRegistryAgentMetadata(root, config)
  const configured = registryConfig(config)?.runnerModule
  const modulePath = configured ? containedPath(root, configured) : containedPath(root, join(metadata.root, 'doc-bridge-adapter.js'))
  if (!modulePath || !existsSync(modulePath)) throw new Error(`Registry agent "${metadata.id}" has no local runner module. Configure intelligence.registry.runnerModule or add doc-bridge-adapter.js to the installed agent.`)
  const loaded = await import(pathToFileURL(modulePath).href) as { default?: unknown; run?: unknown }
  const runner = typeof loaded.run === 'function' ? loaded.run : typeof loaded.default === 'function' ? loaded.default : loaded.default && typeof loaded.default === 'object' && 'run' in loaded.default && typeof loaded.default.run === 'function' ? loaded.default.run : undefined
  if (!runner) throw new Error(`Registry agent runner at ${modulePath} must export a function or { run }. `)
  return runner as RegistryAgentRunner
}

export const loadRegistryAgentMetadata = (root: string, config: DocBridgeConfigV1): RegistryAgentMetadata => {
  const settings = registryConfig(config)
  const id = settings?.agentId ?? DEFAULT_REGISTRY_AGENT_ID
  const agentRoot = settings?.agentRoot ?? 'agents'
  const agentPath = containedPath(root, join(agentRoot, id))
  if (!agentPath || !existsSync(agentPath)) throw new Error(`AgentsKit Registry agent "${id}" is not installed at ${join(agentRoot, id)}. Install it with: npx agentskit add ${id}`)
  const metadataPath = [join(agentPath, 'agent.json'), join(agentPath, 'manifest.json')].find(existsSync)
  if (!metadataPath) throw new Error(`Registry agent "${id}" is installed but has no agent.json or manifest.json metadata.`)
  const metadata = RegistryAgentMetadataSchema.parse(JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown)
  if (metadata.id !== id) throw new Error(`Installed Registry agent metadata id "${metadata.id}" does not match configured id "${id}".`)
  return { ...metadata, root: agentPath }
}

export const createRegistryAgentAdapter = (root: string, config: DocBridgeConfigV1, runner: RegistryAgentRunner): RegistryAgentAdapter => {
  if (!registryConfig(config)?.enabled) throw new Error('Registry agents are disabled. Set intelligence.registry.enabled: true to run an assisted workflow.')
  const metadata = loadRegistryAgentMetadata(resolve(root), config)
  return {
    metadata,
    run: async (snapshot, report, evidence = report.diagnostics.flatMap((diagnostic) => diagnostic.evidence).slice(0, 64)) => {
      const context = deepFreeze({ snapshot: redactValue(snapshot), report: redactValue(report), evidence: redactValue(evidence), capabilities: ['snapshot.read', 'evidence.read', 'proposal.write'] as const, network: false as const, shell: false as const }) as RegistryAgentContext
      const proposal = AgentProposalV1Schema.parse(await runner(context))
      if (proposal.contentHash !== contentHashForArtifactV1(proposal)) throw new Error('Registry agent proposal contentHash does not match its canonical contents.')
      if (proposal.baseSnapshotHash !== snapshot.contentHash || proposal.baseReportHash !== report.contentHash) throw new Error('Registry agent proposal is not based on the supplied snapshot/report hashes.')
      if (proposal.origin.kind !== 'registry-agent' || proposal.origin.id !== metadata.id) throw new Error(`Registry agent proposal origin must be ${metadata.id}.`)
      return proposal
    },
  }
}

export const persistRegistryAgentProposal = (stateDir: string, proposal: AgentProposalV1): string => {
  AgentProposalV1Schema.parse(proposal)
  if (proposal.contentHash !== contentHashForArtifactV1(proposal)) throw new Error('Cannot persist a Registry agent proposal with an invalid contentHash.')
  const safeHash = contentHashForArtifactV1(proposal)
  mkdirSync(join(resolve(stateDir), 'agents'), { recursive: true })
  const path = join(resolve(stateDir), 'agents', `${proposal.origin.id}-${safeHash}.json`)
  writeFileSync(path, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8')
  return path
}
