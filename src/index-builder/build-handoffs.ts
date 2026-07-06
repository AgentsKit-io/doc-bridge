import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import type { CorpusDoc } from './scan-corpus.js'
import { guessAgentDocForPackage } from './scan-corpus.js'
import type { DiscoveredPackage } from './plugins/pnpm-monorepo.js'

export type IndexLookup = {
  packages: string[]
  ownership: Record<string, OwnershipRecord>
  intents: Record<string, IntentRecord>
  changes: Record<string, ChangeRecord>
}

export type OwnershipRecord = {
  id: string
  path: string
  group?: string
  layer?: string
  purpose?: string
  checks: string[]
  agentDoc?: string
  humanDoc?: string
  readme?: string
}

export type IntentRecord = {
  id: string
  title: string
  paths: string[]
}

export type ChangeRecord = {
  id: string
  title: string
  startHere: string
  relatedPackages?: string[]
}

const defaultChecks = (config: DocBridgeConfigV1): string[] => {
  const preset = config.gates?.preset ?? 'minimal'
  if (preset === 'strict' || preset === 'standard') return ['npm test', 'npm run lint']
  return ['npm test']
}

export const buildLookup = (
  config: DocBridgeConfigV1,
  packages: readonly DiscoveredPackage[],
  corpus: readonly CorpusDoc[],
  indexOutFile: string,
): { lookup: IndexLookup; handoffs: Record<string, AgentHandoffV1> } => {
  const ownership: Record<string, OwnershipRecord> = {}
  const handoffs: Record<string, AgentHandoffV1> = {}
  const checks = defaultChecks(config)

  for (const pkg of packages) {
    const override = config.routing?.options?.ownership?.[pkg.id]
    const agentDoc =
      override?.agentDoc ?? guessAgentDocForPackage(corpus, pkg.id) ?? config.corpus.agent.index
    const record: OwnershipRecord = {
      id: pkg.id,
      path: override?.path ?? pkg.path,
      checks: override?.checks ?? checks,
      ...(override?.group ? { group: override.group } : {}),
      ...(override?.layer ? { layer: override.layer } : {}),
      ...(override?.purpose ? { purpose: override.purpose } : {}),
      ...(override?.humanDoc ? { humanDoc: override.humanDoc } : {}),
      agentDoc,
    }
    ownership[pkg.id] = record

    handoffs[pkg.id] = {
      type: 'agent-handoff',
      schemaVersion: 1,
      source: indexOutFile,
      target: {
        type: 'package',
        id: pkg.id,
        path: record.path,
        ...(record.group ? { group: record.group } : {}),
        ...(record.layer ? { layer: record.layer } : {}),
      },
      startHere: agentDoc,
      readBeforeEditing: [agentDoc, 'AGENTS.md'].filter((v, i, a) => a.indexOf(v) === i),
      editRoots: [record.path],
      checks: [...record.checks],
      ...(record.humanDoc ? { humanDoc: record.humanDoc } : {}),
      notes: record.purpose ? [record.purpose] : [],
    }
  }

  const intents: Record<string, IntentRecord> = {}
  for (const intent of config.routing?.options?.intents ?? []) {
    intents[intent.id] = { id: intent.id, title: intent.title, paths: intent.paths }
  }

  const changes: Record<string, ChangeRecord> = {}
  for (const change of config.routing?.options?.changes ?? []) {
    changes[change.id] = {
      id: change.id,
      title: change.title,
      startHere: change.startHere,
      ...(change.relatedPackages ? { relatedPackages: change.relatedPackages } : {}),
    }
  }

  return {
    lookup: {
      packages: packages.map((p) => p.id),
      ownership,
      intents,
      changes,
    },
    handoffs,
  }
}