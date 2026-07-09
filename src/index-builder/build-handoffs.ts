import type { DocBridgeConfigV1 } from '../config/schema.js'
import { defaultChecksForTarget } from '../lib/package-manager.js'
import type { AgentHandoffV1 } from '../schemas/agent-handoff.js'
import {
  guessAgentDocForPackage,
  ownershipFromCorpus,
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

/**
 * Merge package identity from:
 * 1. routing.options.ownership (explicit)
 * 2. pnpm / workspace discovery
 * 3. agent-doc frontmatter (package + editRoot)
 * 4. corpus path heuristics (packages/<id>.md, pillars patterns, etc.)
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

  const seeds = [
    ...ownershipFromFrontmatter(corpus),
    ...(config.routing?.options?.ownershipFromCorpus === false
      ? []
      : ownershipFromCorpus(corpus)),
  ]

  for (const seed of seeds) {
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

const resolveHumanDoc = (
  packageId: string,
  override?: string,
  fmHuman?: string,
  humanDocs: HumanDocMap = {},
): string | undefined => {
  if (override) return override
  if (fmHuman) return fmHuman
  if (humanDocs[packageId]) return humanDocs[packageId]
  // common aliases: scoped package name tail, path segments
  const aliases = [
    packageId,
    packageId.replace(/^@[^/]+\//, ''),
    packageId.replace(/^os-/, ''),
    packageId.replace(/-pattern$/, ''),
  ]
  for (const alias of aliases) {
    if (humanDocs[alias]) return humanDocs[alias]
  }
  return undefined
}

export const buildLookup = (
  config: DocBridgeConfigV1,
  packages: readonly DiscoveredPackage[],
  corpus: readonly CorpusDoc[],
  indexOutFile: string,
  humanDocs: HumanDocMap = {},
  root = process.cwd(),
): { lookup: IndexLookup; handoffs: Record<string, AgentHandoffV1> } => {
  const ownership: Record<string, OwnershipRecord> = {}
  const handoffs: Record<string, AgentHandoffV1> = {}
  const strict = (config.gates?.preset ?? 'minimal') !== 'minimal'
  const fmSeeds = new Map(
    [...ownershipFromFrontmatter(corpus), ...ownershipFromCorpus(corpus)].map((seed) => [
      seed.id,
      seed,
    ]),
  )

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
    const path = override?.path ?? fm?.path ?? pkg.path
    const checks = [
      ...(override?.checks ??
        fm?.checks ??
        defaultChecksForTarget(root, {
          packageId: pkg.id,
          packagePath: path,
          ...(pkg.name ? { packageName: pkg.name } : {}),
          strict,
        })),
    ]
    const humanDoc = resolveHumanDoc(pkg.id, override?.humanDoc, fm?.humanDoc, humanDocs)
    const record: OwnershipRecord = {
      id: pkg.id,
      path,
      checks,
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
