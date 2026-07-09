import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import {
  guessAgentDocForPackage,
  ownershipFromFrontmatter,
  type CorpusDoc,
} from './scan-corpus.js'
import type { DiscoveredPackage } from './plugins/pnpm-monorepo.js'
import type { HumanDocMap } from './plugins/human-markdown.js'

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

/**
 * Merge package identity from:
 * 1. routing.options.ownership (explicit)
 * 2. pnpm / workspace discovery
 * 3. agent-doc frontmatter (package + editRoot)
 */
export const collectPackages = (
  config: DocBridgeConfigV1,
  discovered: readonly DiscoveredPackage[],
  corpus: readonly CorpusDoc[],
): DiscoveredPackage[] => {
  const byId = new Map<string, DiscoveredPackage>()

  for (const [id, entry] of Object.entries(config.routing?.options?.ownership ?? {})) {
    byId.set(id, { id, path: entry.path })
  }

  for (const pkg of discovered) {
    const existing = byId.get(pkg.id)
    if (!existing) {
      byId.set(pkg.id, pkg)
      continue
    }
    byId.set(pkg.id, {
      id: pkg.id,
      path: existing.path || pkg.path,
      ...(pkg.name ? { name: pkg.name } : existing.name ? { name: existing.name } : {}),
    })
  }

  for (const seed of ownershipFromFrontmatter(corpus)) {
    const existing = byId.get(seed.id)
    if (!existing) {
      byId.set(seed.id, { id: seed.id, path: seed.path })
      continue
    }
    if (!existing.path) {
      byId.set(seed.id, { ...existing, path: seed.path })
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export const buildLookup = (
  config: DocBridgeConfigV1,
  packages: readonly DiscoveredPackage[],
  corpus: readonly CorpusDoc[],
  indexOutFile: string,
  humanDocs: HumanDocMap = {},
): { lookup: IndexLookup; handoffs: Record<string, AgentHandoffV1> } => {
  const ownership: Record<string, OwnershipRecord> = {}
  const handoffs: Record<string, AgentHandoffV1> = {}
  const checks = defaultChecks(config)
  const fmSeeds = new Map(ownershipFromFrontmatter(corpus).map((seed) => [seed.id, seed]))

  for (const pkg of packages) {
    const override = config.routing?.options?.ownership?.[pkg.id]
    const fm = fmSeeds.get(pkg.id)
    const agentDoc =
      override?.agentDoc ??
      fm?.agentDoc ??
      guessAgentDocForPackage(corpus, pkg.id) ??
      config.corpus.agent.index
    const startHere = agentDoc ?? ''
    const purpose = override?.purpose ?? fm?.purpose
    const humanDoc = override?.humanDoc ?? fm?.humanDoc ?? humanDocs[pkg.id]
    const record: OwnershipRecord = {
      id: pkg.id,
      path: override?.path ?? fm?.path ?? pkg.path,
      checks: [...(override?.checks ?? fm?.checks ?? checks)],
      ...(override?.group ? { group: override.group } : {}),
      ...(override?.layer ? { layer: override.layer } : {}),
      ...(purpose ? { purpose } : {}),
      ...(humanDoc ? { humanDoc } : {}),
      ...(agentDoc ? { agentDoc } : {}),
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
      startHere,
      readBeforeEditing: [agentDoc, 'AGENTS.md'].filter((v, i, a): v is string =>
        Boolean(v) && a.indexOf(v) === i,
      ),
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
