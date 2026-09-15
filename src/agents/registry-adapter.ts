import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { DocumentationAuditReportV1 } from '../audit/documentation.js'
import { AgentProposalV1Schema, type AgentProposalV1, type DiscoverySnapshotV1, type ReconciliationReportV1 } from '../schemas/knowledge.js'
import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'
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
  readonly documentation?: Pick<DocumentationAuditReportV1, 'contentHash' | 'sourceRevision' | 'status' | 'findings' | 'documentAssessments' | 'metrics' | 'limitations'>
  readonly capabilities: readonly ['snapshot.read', 'evidence.read', 'proposal.write']
  readonly network: false
  readonly shell: false
  readonly deterministic: boolean
}

export type RegistryAgentRunner = (context: RegistryAgentContext) => Promise<unknown> | unknown

type RegistryCliConfig = NonNullable<NonNullable<NonNullable<DocBridgeConfigV1['intelligence']>['registry']>['cli']>

/**
 * The v2 protocol: a task and a bounded set of context packs, never the snapshot.
 *
 * `curate` and `review` return `proposals` — `EnrichmentProposalV1` values, validated by the
 * enrich stage, never here; `adjudicate` returns adjudications under the same key. The adapter
 * checks transport and budget and returns the raw array: grounding is the validators' job, and
 * keeping it there is what makes a stored overlay reproducible from its proposals.
 */
export const REGISTRY_AGENT_PROTOCOL_V2 = 'doc-bridge.registry-agent.v2'

export type RegistryEnrichmentContext = {
  readonly protocol: typeof REGISTRY_AGENT_PROTOCOL_V2
  readonly task: 'curate' | 'review' | 'adjudicate'
  readonly role: string
  readonly promptVersion: string
  readonly packs: readonly unknown[]
  readonly capabilities: readonly ['pack.read', 'proposal.write']
  readonly network: false
  readonly shell: false
  readonly deterministic: boolean
}

export type RegistryAgentAdapter = {
  readonly metadata: RegistryAgentMetadata
  readonly run: (snapshot: DiscoverySnapshotV1, report: ReconciliationReportV1, evidence?: readonly RegistryAgentContext['evidence'][number][], documentation?: DocumentationAuditReportV1) => Promise<AgentProposalV1>
  /** Send packs for a task and return the raw `proposals` array. Throws on transport, budget or shape failure. */
  readonly enrich: (task: RegistryEnrichmentContext['task'], packs: readonly unknown[], options?: { readonly role?: string; readonly promptVersion?: string }) => Promise<readonly unknown[]>
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

const registryConfig = (config: DocBridgeConfigV1) => config.intelligence?.registry

const evidenceKey = (item: RegistryAgentContext['evidence'][number]): string => `${item.source}:${item.path}:${item.lineStart ?? ''}:${item.lineEnd ?? ''}`

const validateGrounding = (proposal: AgentProposalV1, snapshot: DiscoverySnapshotV1, report: ReconciliationReportV1, documentation?: DocumentationAuditReportV1): void => {
  const diagnosticIds = new Set(report.diagnostics.map((diagnostic) => diagnostic.id))
  for (const finding of documentation?.findings ?? []) diagnosticIds.add(finding.id)
  const evidence = [
    ...report.diagnostics.flatMap((diagnostic) => diagnostic.evidence),
    ...snapshot.entities.flatMap((entity) => entity.evidence),
    ...snapshot.relations.flatMap((relation) => relation.evidence),
    ...(documentation?.findings.flatMap((finding) => finding.evidence) ?? []),
  ]
  const evidenceKeys = new Set(evidence.map(evidenceKey))
  if (!proposal.evidence.length) throw new Error('Registry agent proposal must contain at least one evidence reference.')
  if (proposal.relatedDiagnosticIds.some((id) => !diagnosticIds.has(id))) throw new Error('Registry agent proposal references an unknown diagnostic.')
  if (proposal.evidence.some((item) => !evidenceKeys.has(evidenceKey(item)))) throw new Error('Registry agent proposal contains evidence outside the supplied snapshot/report.')
}

const runCli = (root: string, cli: RegistryCliConfig, context: RegistryAgentContext | RegistryEnrichmentContext, timeoutMs: number, maxInputBytes: number, maxResponseBytes: number): Promise<unknown> => new Promise((resolve, reject) => {
  const v2 = 'protocol' in context
  const input = JSON.stringify(
    v2
      ? { protocol: REGISTRY_AGENT_PROTOCOL_V2, response: 'Return exactly one JSON object { "proposals": [...] } on stdout. Do not emit markdown or logs on stdout.', context }
      : { protocol: 'doc-bridge.registry-agent.v1', response: 'Return exactly one AgentProposalV1 JSON object on stdout. Do not emit markdown or logs on stdout.', context },
  )
  if (Buffer.byteLength(input, 'utf8') > maxInputBytes) {
    reject(new Error(`Registry agent CLI input limit ${maxInputBytes} bytes exceeded.`))
    return
  }
  const child = spawn(cli.command, cli.args ?? [], {
    cwd: root,
    shell: false,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let settled = false
  const finish = (callback: () => void): void => {
    if (settled) return
    settled = true
    callback()
  }
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    finish(() => reject(new Error(`Registry agent CLI timed out after ${timeoutMs}ms.`)))
  }, timeoutMs)
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8')
    if (Buffer.byteLength(stdout, 'utf8') > maxResponseBytes) {
      clearTimeout(timer)
      child.kill('SIGTERM')
      finish(() => reject(new Error(`Registry agent CLI response limit ${maxResponseBytes} bytes exceeded.`)))
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
    if (Buffer.byteLength(stderr, 'utf8') > maxResponseBytes) stderr = stderr.slice(-maxResponseBytes)
  })
  child.once('error', (error) => {
    clearTimeout(timer)
    finish(() => reject(new Error(`Registry agent CLI failed to start: ${error.message}`)))
  })
  child.once('close', (code, signal) => {
    clearTimeout(timer)
    finish(() => {
      if (code !== 0) {
        const detail = stderr.trim() ? `: ${stderr.trim()}` : signal ? ` (${signal})` : ''
        reject(new Error(`Registry agent CLI exited with code ${code ?? 'unknown'}${detail}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as unknown)
      } catch (error) {
        reject(new Error(`Registry agent CLI must return one JSON object on stdout: ${error instanceof Error ? error.message : String(error)}`))
      }
    })
  })
  child.stdin.once('error', (error) => {
    clearTimeout(timer)
    child.kill('SIGTERM')
    finish(() => reject(new Error(`Registry agent CLI stdin failed: ${error.message}`)))
  })
  child.stdin.end(input)
})

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

export const createRegistryAgentAdapter = (root: string, config: DocBridgeConfigV1, runner?: RegistryAgentRunner): RegistryAgentAdapter => {
  if (!registryConfig(config)?.enabled) throw new Error('Registry agents are disabled. Set intelligence.registry.enabled: true to run an assisted workflow.')
  const metadata = loadRegistryAgentMetadata(resolve(root), config)
  const settings = registryConfig(config) ?? {}
  const timeoutMs = settings.timeoutMs ?? 120_000
  const maxInputBytes = settings.maxInputBytes ?? 8_000_000
  const maxResponseBytes = settings.maxResponseBytes ?? 256_000
  const maxTokens = settings.maxTokens ?? Math.ceil(maxResponseBytes / 4)
  const maxConcurrency = settings.maxConcurrency ?? 1
  let active = 0
  const deterministicCache = new Map<string, AgentProposalV1>()
  /** One transport for both protocols: the configured CLI, or the local runner, under the same limits. */
  const transport = async (context: RegistryAgentContext | RegistryEnrichmentContext): Promise<unknown> => {
    if (active >= maxConcurrency) throw new Error(`Registry agent concurrency limit ${maxConcurrency} exceeded.`)
    if (!settings.cli && !runner) throw new Error('Registry agent requires either intelligence.registry.cli or a local runner module.')
    active += 1
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      let raw: unknown
      if (settings.cli) {
        raw = await runCli(resolve(root), settings.cli, context, timeoutMs, maxInputBytes, maxResponseBytes)
      } else {
        const localRunner = runner as RegistryAgentRunner
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Registry agent timed out after ${timeoutMs}ms.`)), timeoutMs) })
        raw = await Promise.race([Promise.resolve(localRunner(context as RegistryAgentContext)), timeout])
      }
      const responseBytes = Buffer.byteLength(JSON.stringify(raw) ?? '')
      if (responseBytes > maxResponseBytes) throw new Error(`Registry agent response limit ${maxResponseBytes} bytes exceeded.`)
      if (Math.ceil(responseBytes / 4) > maxTokens) throw new Error(`Registry agent token budget ${maxTokens} exceeded.`)
      return raw
    } finally {
      if (timer) clearTimeout(timer)
      active -= 1
    }
  }
  return {
    metadata,
    enrich: async (task, packs, options = {}) => {
      const input = JSON.stringify(packs)
      if (Buffer.byteLength(input, 'utf8') > maxInputBytes) throw new Error(`Registry agent input limit ${maxInputBytes} bytes exceeded.`)
      const context = deepFreeze({
        protocol: REGISTRY_AGENT_PROTOCOL_V2,
        task,
        role: options.role ?? task,
        promptVersion: options.promptVersion ?? '1',
        packs: redactValue(packs),
        capabilities: ['pack.read', 'proposal.write'] as const,
        network: false as const,
        shell: false as const,
        deterministic: settings.deterministic ?? true,
      }) as RegistryEnrichmentContext
      const raw = await transport(context)
      const proposals = raw && typeof raw === 'object' && 'proposals' in raw ? (raw as { proposals: unknown }).proposals : undefined
      if (!Array.isArray(proposals)) throw new Error('Registry agent must return one JSON object with a "proposals" array.')
      if (proposals.length > 1_024) throw new Error('Registry agent returned more than 1024 proposals.')
      return proposals
    },
    run: async (snapshot, report, evidence = report.diagnostics.flatMap((diagnostic) => diagnostic.evidence).slice(0, 64), documentation) => {
      const cacheKey = sha256NormalizedV1({ snapshotHash: snapshot.contentHash, reportHash: report.contentHash, documentationAuditHash: documentation?.contentHash ?? null, agentId: metadata.id, agentVersion: metadata.version, cli: settings.cli ?? null, maxInputBytes, evidence })
      if (settings.deterministic && deterministicCache.has(cacheKey)) return deterministicCache.get(cacheKey) as AgentProposalV1
      const context = deepFreeze({
        snapshot: redactValue(snapshot),
        report: redactValue(report),
        evidence: redactValue(evidence),
        ...(documentation ? {
          documentation: redactValue({
            contentHash: documentation.contentHash,
            sourceRevision: documentation.sourceRevision,
            status: documentation.status,
            findings: documentation.findings.slice(0, 64),
            documentAssessments: documentation.documentAssessments.slice(0, 128),
            metrics: documentation.metrics,
            limitations: documentation.limitations,
          }),
        } : {}),
        capabilities: ['snapshot.read', 'evidence.read', 'proposal.write'] as const,
        network: false as const,
        shell: false as const,
        deterministic: settings.deterministic ?? true,
      }) as RegistryAgentContext
      const raw = await transport(context)
      const proposal = AgentProposalV1Schema.parse(raw)
      if (proposal.contentHash !== contentHashForArtifactV1(proposal)) throw new Error('Registry agent proposal contentHash does not match its canonical contents.')
      if (proposal.baseSnapshotHash !== snapshot.contentHash || proposal.baseReportHash !== report.contentHash) throw new Error('Registry agent proposal is not based on the supplied snapshot/report hashes.')
      if (documentation && proposal.baseDocumentationAuditHash !== documentation.contentHash) throw new Error('Registry agent proposal is not based on the supplied documentation audit hash.')
      if (proposal.origin.kind !== 'registry-agent' || proposal.origin.id !== metadata.id || proposal.origin.version !== metadata.version) throw new Error(`Registry agent proposal origin must be ${metadata.id}@${metadata.version}.`)
      validateGrounding(proposal, snapshot, report, documentation)
      if (settings.deterministic) deterministicCache.set(cacheKey, proposal)
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
