import { DiscoverySnapshotV1Schema, ReconciliationReportV1Schema, type DiscoverySnapshotV1, type KnowledgeEntity, type ReconciliationReportV1 } from '../schemas/knowledge.js'
import { sha256NormalizedV1 } from '../index-builder/content-hash.js'
import { redactSecrets } from '../safety/repository.js'

export type OfflineReportInput = {
  readonly snapshot: DiscoverySnapshotV1
  readonly report: ReconciliationReportV1
}

export type OfflineReportOptions = {
  readonly includeSnippets?: boolean
  readonly privacy?: 'private' | 'anonymized'
}

export type OfflineReportArtifact = {
  readonly mode: 'single-file' | 'directory'
  readonly indexHtml: string
  readonly files: Readonly<Record<string, string>>
  readonly manifest: string
}

export const DEFAULT_LARGE_REPORT_THRESHOLD_BYTES = 5_000_000

type ReportViewNode = {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly path: string | undefined
  readonly memberCount?: number
}

type ReportViewModel = {
  readonly overview: {
    readonly nodes: readonly ReportViewNode[]
    readonly edges: readonly { from: string; to: string; count: number; kinds: readonly string[]; relationIds: readonly string[] }[]
  }
  readonly groups: Readonly<Record<string, { kind: string; name: string; path: string | undefined; members: readonly string[]; moduleCount: number }>>
  readonly entityGroup: Readonly<Record<string, string>>
  readonly diagnosticGroup?: Readonly<Record<string, readonly string[]>>
  readonly diagnosticRelationFindings?: Readonly<Record<string, readonly { status: string; severity: string }[]>>
  readonly levelChunks: {
    readonly default: string
    readonly groups: Readonly<Record<string, string>>
    readonly packages: readonly string[]
  }
}

const pathParts = (value: string | undefined): string[] => (value ?? '').split('/').filter(Boolean)

const packageFamily = (entity: KnowledgeEntity): string => {
  const packageName = entity.name.replace(/^@[^/]+\//, '')
  const nameFamily = packageName.split(/[-_./]/)[0]
  if (nameFamily) return nameFamily.toLowerCase()
  return pathParts(entity.path)[1] ?? pathParts(entity.path)[0] ?? 'other'
}

const reportGroupKey = (entity: KnowledgeEntity, appLayout: boolean): string => {
  const parts = pathParts(entity.path)
  if (appLayout && parts[0] === 'apps' && parts[1]) return `app:${parts[1]}`
  if (appLayout && parts[0] === 'packages') return 'shared-packages'
  if (appLayout && (parts.length === 0 || parts[0] === '.')) return 'workspace'
  return packageFamily(entity)
}

const titleCase = (value: string): string => value.split(/[-_]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const levelChunkName = (scope: 'group' | 'package', id: string): string => `chunks/levels-${scope}-${sha256NormalizedV1(id).slice(0, 12)}.js`

const buildReportViewModel = (snapshot: DiscoverySnapshotV1): ReportViewModel => {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]))
  const packages = snapshot.entities.filter((entity) => entity.kind === 'package')
  const packageForEntity = new Map<string, string>()
  const externalIds = new Set<string>()

  for (const relation of snapshot.relations) {
    if (relation.kind === 'contains' && entities.get(relation.from)?.kind === 'package') packageForEntity.set(relation.to, relation.from)
    if (entities.get(relation.from)?.kind === 'external') externalIds.add(relation.from)
    if (entities.get(relation.to)?.kind === 'external') externalIds.add(relation.to)
  }

  const appLayout = packages.some((entity) => pathParts(entity.path)[0] === 'apps')
  const groups = new Map<string, { kind: string; name: string; path: string | undefined; members: string[] }>()
  const entityGroup: Record<string, string> = {}
  const groupModuleCounts = new Map<string, number>()

  for (const entity of packages) {
    const family = reportGroupKey(entity, appLayout)
    const id = `group:${family}`
    const current = groups.get(id) ?? {
      kind: family.startsWith('app:') ? 'app' : family === 'shared-packages' ? 'shared' : family === 'workspace' ? 'workspace' : 'domain',
      name: family.startsWith('app:') ? `${titleCase(family.slice(4))} app` : family === 'shared-packages' ? 'Shared packages' : family === 'workspace' ? 'Workspace root' : family,
      path: family.startsWith('app:') ? `apps/${family.slice(4)}` : family === 'shared-packages' ? 'packages' : family === 'workspace' ? '.' : undefined,
      members: [] as string[],
    }
    current.members.push(entity.id)
    groups.set(id, current)
    entityGroup[entity.id] = id
  }

  for (const [entityId, packageId] of packageForEntity) {
    const groupId = entityGroup[packageId]
    if (groupId) entityGroup[entityId] = groupId
    if (groupId && entities.get(entityId)?.kind === 'module') groupModuleCounts.set(groupId, (groupModuleCounts.get(groupId) ?? 0) + 1)
  }

  if (externalIds.size) {
    const externalGroupId = 'group:external-dependencies'
    groups.set(externalGroupId, {
      kind: 'external',
      name: 'External dependencies',
      path: undefined,
      members: [...externalIds].sort(),
    })
    for (const entityId of externalIds) entityGroup[entityId] = externalGroupId
  }

  const allOverviewNodes: ReportViewNode[] = [...groups.entries()].map(([id, group]) => ({
    id,
    kind: group.kind,
    name: group.name,
    path: group.path,
    memberCount: group.members.length,
  }))
  const hasApplications = allOverviewNodes.some((node) => node.kind === 'app')
  const overviewNodes = allOverviewNodes.filter((node) =>
    node.kind !== 'external' && (!hasApplications || node.kind !== 'workspace'),
  )
  const overviewNodeIds = new Set(overviewNodes.map((node) => node.id))
  const edgeMap = new Map<string, { from: string; to: string; count: number; kinds: Set<string>; relationIds: Set<string> }>()
  for (const relation of snapshot.relations) {
    if (relation.kind === 'contains') continue
    const from = entityGroup[relation.from]
    const to = entityGroup[relation.to]
    if (!from || !to || from === to) continue
    const key = `${from}→${to}`
    const edge = edgeMap.get(key) ?? { from, to, count: 0, kinds: new Set<string>(), relationIds: new Set<string>() }
    edge.count += 1
    edge.kinds.add(relation.kind)
    edge.relationIds.add(relation.id)
    edgeMap.set(key, edge)
  }

  return {
    overview: {
      nodes: overviewNodes.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    edges: [...edgeMap.values()]
      .filter((edge) => overviewNodeIds.has(edge.from) && overviewNodeIds.has(edge.to))
      .map((edge) => ({ ...edge, kinds: [...edge.kinds].sort(), relationIds: [...edge.relationIds].sort() }))
        .sort((left, right) => right.count - left.count || left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    },
    groups: Object.fromEntries([...groups.entries()].map(([id, group]) => [id, { ...group, members: [...group.members].sort(), moduleCount: groupModuleCounts.get(id) ?? 0 }])),
    entityGroup,
    levelChunks: {
      default: 'chunks/levels-packages.js',
      groups: Object.fromEntries([...groups.keys()].map((id) => [id, levelChunkName('group', id)])),
      packages: [...packages].sort((left, right) => left.id.localeCompare(right.id)).map((entity) => levelChunkName('package', entity.id)),
    },
  }
}

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const anchor = (prefix: string, value: string): string => `${prefix}-${value.replace(/[^A-Za-z0-9_-]+/g, '-')}`

const embeddedJson = (value: unknown): string => JSON.stringify(value).replaceAll('<', '\\u003c')

const errorPage = (message: string): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Doc Bridge report error</title><style>body{font:16px system-ui;margin:3rem;color:#311}main{max-width:60rem;margin:auto;border:1px solid #d99;padding:2rem;border-radius:8px;background:#fff8f8}code{white-space:pre-wrap}</style></head><body><main><h1>Doc Bridge report unavailable</h1><p>The saved snapshot/report could not be rendered.</p><code>${escapeHtml(message)}</code><p>Run <code>ak-docs check</code> to regenerate valid artifacts.</p></main></body></html>`

const reportData = (snapshot: DiscoverySnapshotV1, report: ReconciliationReportV1, includeSnippets: boolean, privacy: OfflineReportOptions['privacy'] = 'private') => {
  const evidence = (items: readonly { source: string; path: string; lineStart?: number | undefined; lineEnd?: number | undefined; context?: string | undefined }[]) => items.map(({ context, ...item }) => includeSnippets && context ? { ...item, context: redactSecrets(context) } : item)
  const base = {
    project: snapshot.project,
    revision: snapshot.sourceRevision,
    revisionKind: snapshot.sourceRevisionKind,
    snapshotHash: snapshot.contentHash,
    reportHash: report.contentHash,
    configurationHash: snapshot.configurationHash,
    pipelineVersion: snapshot.pipelineVersion,
    analyzerVersions: snapshot.analyzerVersions,
    diagnosticCount: report.diagnostics.length,
    requiredRelationKinds: report.summary.requiredRelationKinds,
    diagnosticSummary: {
      errors: report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
      warnings: report.diagnostics.filter((diagnostic) => diagnostic.severity === 'warn').length,
      undocumented: report.diagnostics.filter((diagnostic) => diagnostic.status === 'undocumented').length,
      drift: report.diagnostics.filter((diagnostic) => diagnostic.status === 'stale-or-unverified' || diagnostic.status === 'conflict').length,
    },
    entities: snapshot.entities.map((entity, index) => ({
      id: entity.id,
      anchor: entity.id.length > 64 ? `entity-n${index}` : anchor('entity', entity.id),
      kind: entity.kind,
      name: entity.name,
      path: entity.path,
      provenance: entity.provenance,
      evidence: evidence(entity.evidence),
    })),
    relations: snapshot.relations.map((relation) => ({
      id: relation.id,
      kind: relation.kind,
      from: relation.from,
      to: relation.to,
      provenance: relation.provenance,
      evidence: evidence(relation.evidence),
    })),
    diagnostics: report.diagnostics.map((diagnostic) => ({
      id: diagnostic.id,
      code: diagnostic.code,
      status: diagnostic.status,
      severity: diagnostic.severity,
      message: diagnostic.message,
      entityIds: diagnostic.entityIds ?? [],
      relationIds: diagnostic.relationIds ?? [],
      remediation: diagnostic.remediation,
      evidence: evidence(diagnostic.evidence),
    })),
    coverage: snapshot.coverage,
    view: buildReportViewModel(snapshot),
  }
  if (privacy !== 'anonymized') return base

  const pad = (value: number): string => String(value).padStart(3, '0')
  const sortedEntities = [...base.entities].sort((left, right) => left.id.localeCompare(right.id))
  const entityOrdinals = new Map<string, number>()
  const entityIds = new Map(sortedEntities.map((entity) => {
    const next = (entityOrdinals.get(entity.kind) ?? 0) + 1
    entityOrdinals.set(entity.kind, next)
    return [entity.id, `entity:${entity.kind}-${pad(next)}`] as const
  }))
  const entityNames = new Map<string, number>()
  const nameFor = (kind: string): string => {
    const prefix = kind === 'external' ? 'dependency' : kind
    const next = (entityNames.get(prefix) ?? 0) + 1
    entityNames.set(prefix, next)
    return `${prefix}-${pad(next)}`
  }
  const sortedRelations = [...base.relations].sort((left, right) => left.id.localeCompare(right.id))
  const relationIds = new Map(sortedRelations.map((relation, index) => [relation.id, `relation:${pad(index + 1)}`]))
  const sortedDiagnostics = [...base.diagnostics].sort((left, right) => left.id.localeCompare(right.id))
  const diagnosticIds = new Map(sortedDiagnostics.map((diagnostic, index) => [diagnostic.id, `finding:${pad(index + 1)}`]))
  const genericEvidence = (items: readonly { source: string; lineStart?: number | undefined; lineEnd?: number | undefined }[]) => items.map((item, index) => ({
    source: item.source,
    path: `evidence-${pad(index + 1)}`,
    ...(item.lineStart === undefined ? {} : { lineStart: item.lineStart }),
    ...(item.lineEnd === undefined ? {} : { lineEnd: item.lineEnd }),
  }))
  const groups = Object.entries(base.view.groups).sort(([left], [right]) => left.localeCompare(right))
  const groupIds = new Map(groups.map(([id], index) => [id, `group:${pad(index + 1)}`]))
  const groupNames = new Map<string, number>()
  const groupName = (kind: string): string => {
    if (kind === 'external') return 'External dependencies'
    if (kind === 'shared') return 'Shared packages'
    if (kind === 'workspace') return 'Workspace'
    const next = (groupNames.get(kind) ?? 0) + 1
    groupNames.set(kind, next)
    return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${next}`
  }
  const sanitizedGroups = Object.fromEntries(groups.map(([id, group]) => [groupIds.get(id) as string, {
    kind: group.kind,
    name: groupName(group.kind),
    path: undefined,
    members: group.members.map((member) => entityIds.get(member) as string),
    moduleCount: group.moduleCount,
  }]))
  const sanitizedOverviewNodes = base.view.overview.nodes.map((node) => ({
    id: groupIds.get(node.id) as string,
    kind: node.kind,
    name: sanitizedGroups[groupIds.get(node.id) as string]?.name ?? 'Scope',
    path: undefined,
    memberCount: node.memberCount,
  }))
  const sanitizedView = {
    overview: {
      nodes: sanitizedOverviewNodes,
      edges: base.view.overview.edges.map((edge) => ({
        from: groupIds.get(edge.from) as string,
        to: groupIds.get(edge.to) as string,
        count: edge.count,
        kinds: edge.kinds,
        relationIds: edge.relationIds.map((id) => relationIds.get(id) as string),
      })),
    },
    groups: sanitizedGroups,
    entityGroup: Object.fromEntries(Object.entries(base.view.entityGroup).map(([id, group]) => [entityIds.get(id) as string, groupIds.get(group) as string])),
    levelChunks: {
      default: base.view.levelChunks.default,
      groups: Object.fromEntries([...groupIds.values()].map((id) => [id, levelChunkName('group', id)])),
      packages: [...entityIds.values()].filter((id) => id.startsWith('entity:package-')).sort().map((id) => levelChunkName('package', id)),
    },
  }
  return {
    ...base,
    project: { name: 'Anonymized repository' },
    revision: 'redacted',
    entities: base.entities.map((entity) => ({
      id: entityIds.get(entity.id) as string,
      anchor: anchor('entity', entityIds.get(entity.id) as string),
      kind: entity.kind,
      name: nameFor(entity.kind),
      path: undefined,
      provenance: entity.provenance,
      evidence: genericEvidence(entity.evidence),
    })),
    relations: base.relations.map((relation) => ({
      id: relationIds.get(relation.id) as string,
      kind: relation.kind,
      from: entityIds.get(relation.from) as string,
      to: entityIds.get(relation.to) as string,
      provenance: relation.provenance,
      evidence: genericEvidence(relation.evidence),
    })),
    diagnostics: base.diagnostics.map((diagnostic) => ({
      id: diagnosticIds.get(diagnostic.id) as string,
      code: diagnostic.code,
      status: diagnostic.status,
      severity: diagnostic.severity,
      message: `Finding ${diagnostic.code}`,
      entityIds: diagnostic.entityIds?.map((id) => entityIds.get(id) as string) ?? [],
      relationIds: diagnostic.relationIds?.map((id) => relationIds.get(id) as string) ?? [],
      evidence: genericEvidence(diagnostic.evidence),
    })),
    coverage: base.coverage.map((entry, index) => ({
      analyzer: entry.analyzer,
      analyzerVersion: entry.analyzerVersion,
      scope: `scope-${pad(index + 1)}`,
      status: entry.status,
      ...(entry.reason ? { reason: 'Coverage boundary reported by analyzer.' } : {}),
      ...(entry.evidence ? { evidence: genericEvidence(entry.evidence) } : {}),
    })),
    view: sanitizedView,
  }
}

let styles = String.raw`
:root{color-scheme:light;--ink:#17251f;--muted:#60706a;--paper:#f5f7f3;--panel:#fff;--line:#d9e0da;--green:#18794e;--blue:#236b83;--amber:#a9640b;--red:#b33c35;--shadow:0 12px 32px rgba(23,37,31,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--blue)}.shell{max-width:1500px;margin:auto;padding:24px}.masthead{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;border-bottom:1px solid var(--line);padding:8px 0 24px}.eyebrow{color:var(--green);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.masthead h1{font:700 clamp(28px,4vw,52px)/1.03 Georgia,serif;letter-spacing:-.04em;margin:8px 0}.lede{color:var(--muted);font-size:16px;max-width:720px;margin:0}.run-meta{text-align:right;color:var(--muted);font-size:12px}.run-meta strong{display:block;color:var(--green);font-size:14px}.read-only{border:1px solid #b9d7c6;background:#edf8f0;color:#185b3b;border-radius:999px;display:inline-flex;padding:4px 10px;font-weight:700;font-size:12px}.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:20px 0}.metric,.insight,.panel{background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:14px}.metric{padding:16px}.metric b{font-size:27px;display:block;line-height:1}.metric span{color:var(--muted);display:block;margin-top:7px}.metric.warn b{color:var(--amber)}.metric.bad b{color:var(--red)}.lens-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:22px 0 12px}.tabs{display:flex;gap:4px;flex-wrap:wrap}.tab,.level{border:1px solid transparent;background:transparent;border-radius:8px;padding:8px 11px;color:var(--muted)}.tab:hover,.level:hover{background:#e8eee9;color:var(--ink)}.tab[aria-selected=true],.level[aria-pressed=true]{background:var(--ink);color:#fff}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.filters label{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:6px}.filters input,.filters select,.filters button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;color:var(--ink)}.filters input{min-width:220px}.filters button{color:var(--blue)}.insights{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 20px}.insight{padding:14px}.insight h3{font-size:13px;margin:0 0 5px}.insight p{color:var(--muted);margin:0;font-size:12px}.tag{display:inline-block;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#edf0ee;color:var(--muted)}.tag.heuristic{background:#fff3dc;color:#8a570a}.tag.error{background:#fde8e6;color:var(--red)}.tag.warn{background:#fff2d9;color:var(--amber)}.tag.info{background:#e6f1f5;color:var(--blue)}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px}.panel{padding:18px}.panel h2{font:700 23px Georgia,serif;margin:0}.panel h3{font-size:14px;margin:0}.panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.subtle{color:var(--muted);font-size:12px}.map-wrap{border:1px solid var(--line);border-radius:10px;overflow:auto;background:linear-gradient(135deg,#fbfcfa,#f0f5f0)}#graph{display:block;width:100%;min-width:760px;height:560px}.edge{stroke:#b8c6bd;stroke-width:1.3;opacity:.65}.edge.alert{stroke:#d08a35;stroke-width:2}.edge-label{fill:var(--muted);font-size:10px}.graph-node{cursor:pointer}.graph-node rect{fill:#fff;stroke:#9eb0a4;stroke-width:1.2}.graph-node:hover rect,.graph-node:focus rect{stroke:var(--blue);stroke-width:2}.graph-node.selected rect{stroke:var(--green);stroke-width:3}.graph-node.issue rect{fill:#fffaf0;stroke:#c98a2c}.graph-node text{pointer-events:none}.node-label{font-size:12px;font-weight:750}.node-kind{font-size:10px;fill:var(--muted)}.node-count{font-size:10px;fill:var(--green);font-weight:800}.empty{padding:32px;text-align:center;color:var(--muted)}.side{position:sticky;top:14px;align-self:start}.detail-title{font:700 22px Georgia,serif;margin:4px 0}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin:14px 0}.detail-grid b{display:block;font-size:19px}.detail-grid span{color:var(--muted);font-size:11px}.path{overflow-wrap:anywhere;color:var(--muted);font-size:12px}.list{list-style:none;margin:10px 0 0;padding:0}.list li{border-top:1px solid var(--line);padding:8px 0;font-size:12px}.run{margin-top:14px}.run-summary{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.chip{border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--muted);font-size:12px}.chip b{color:var(--ink)}.finding{border-top:1px solid var(--line);padding:14px 0}.finding-head{display:flex;justify-content:space-between;gap:10px}.finding h3{margin:0;font-size:14px}.finding p{margin:5px 0;color:var(--muted)}.finding ul{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:12px}.coverage-row{display:grid;grid-template-columns:170px 1fr 90px;gap:10px;align-items:center;border-top:1px solid var(--line);padding:10px 0;font-size:12px}.bar{height:7px;background:#e7ece8;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--green)}.bar i.partial{background:var(--amber)}.bar i.none{background:var(--red)}.metadata{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.metadata div{border-top:1px solid var(--line);padding-top:8px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.metadata b{display:block;color:var(--ink);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.hidden{display:none!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:900px){.summary{grid-template-columns:repeat(3,minmax(0,1fr))}.insights{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace{grid-template-columns:1fr}.side{position:static}.run-meta{display:none}}@media(max-width:560px){.shell{padding:14px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.insights{grid-template-columns:1fr}.masthead{display:block}.filters input{min-width:0;width:100%}.filters label:first-child{width:100%}.metadata{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ink:#edf5ef;--muted:#a8b8ae;--paper:#111815;--panel:#18221d;--line:#304037;--green:#6dd19c;--blue:#7dc4dc;--amber:#efb866;--red:#f08a80;--shadow:0 12px 32px rgba(0,0,0,.24)}.map-wrap{background:linear-gradient(135deg,#19231d,#101611)}.filters input,.filters select,.filters button{background:#1d2922;color:var(--ink)}.graph-node rect{fill:#1b2820;stroke:#719080}.graph-node.issue rect{fill:#332c1d}}
`

styles += String.raw`
:root{--ink:#182b2b;--muted:#536664;--paper:#efe9df;--panel:#f8f5ee;--line:#c8c8b9;--green:#176b51;--blue:#155a68;--amber:#93530b;--red:#9b302b;--shadow:none}
*{box-sizing:border-box}body{background:var(--paper);font-family:"Avenir Next","Segoe UI",ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5}.shell{max-width:1720px;padding:30px clamp(20px,4vw,64px) 56px}.masthead{align-items:flex-start;border-bottom:2px solid var(--ink);padding:4px 0 28px}.masthead>div:first-child{max-width:840px}.eyebrow{font-size:10px;letter-spacing:.16em}.masthead h1{font-family:"Iowan Old Style",Georgia,serif;font-size:clamp(3rem,7vw,7.2rem);letter-spacing:-.075em;line-height:.9;margin:16px 0 20px}.lede{font-size:17px;line-height:1.45;max-width:650px}.run-meta{padding-top:3px;min-width:210px}.read-only{border:0;border-radius:0;padding:0;background:none;color:var(--green);font-size:10px;letter-spacing:.1em;text-transform:uppercase}.run-meta strong{color:var(--ink);font-size:12px;overflow-wrap:anywhere;margin-top:16px}.summary{grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin:0;padding:18px 0 22px;border-bottom:1px solid var(--line)}.metric{border:0;border-left:1px solid var(--line);border-radius:0;background:none;box-shadow:none;padding:0 18px}.metric:first-child{border-left:0;padding-left:0}.metric b{font-family:"Iowan Old Style",Georgia,serif;font-size:38px;letter-spacing:-.05em}.metric span{font-size:11px;letter-spacing:.07em;text-transform:uppercase}.lens-bar{align-items:flex-end;margin:42px 0 6px}.tabs{gap:0}.tab,.level{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--muted);padding:8px 14px;min-height:38px;font-weight:700}.tab:first-child,.level:first-child{padding-left:0}.tab:hover,.level:hover{background:none;color:var(--ink);border-color:var(--line)}.tab[aria-selected=true],.level[aria-pressed=true]{background:none;color:var(--ink);border-color:var(--green)}.lens-bar>.subtle{max-width:430px;text-align:right}.filters{border-block:1px solid var(--line);padding:14px 0;margin:12px 0 24px}.filters input,.filters select,.filters button{border:1px solid var(--line);border-radius:3px;background:var(--panel);min-height:38px}.filters button{font-weight:700}.insights{grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:18px 0 30px}.insight{border:0;border-left:1px solid var(--line);border-radius:0;background:none;box-shadow:none;padding:14px 16px 16px}.insight:first-child{border-left:0;padding-left:0}.insight h3{font-size:12px;letter-spacing:.02em}.insight p{font-size:13px}.tag{border-radius:2px;padding:2px 5px;font-size:9px}.workspace{grid-template-columns:minmax(0,1fr) 350px;gap:24px}.panel{border:1px solid var(--line);border-radius:3px;background:var(--panel);box-shadow:none;padding:24px}.panel h2{font-family:"Iowan Old Style",Georgia,serif;font-size:30px;letter-spacing:-.04em}.map-wrap{border:1px solid #aeb9ae;border-radius:2px;background-color:#e8eee7;background-image:linear-gradient(rgba(24,43,43,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(24,43,43,.07) 1px,transparent 1px);background-size:24px 24px}.map-wrap::-webkit-scrollbar{height:10px}.map-wrap::-webkit-scrollbar-thumb{background:var(--line)}#graph{height:620px}.graph-node rect{fill:#f8f5ee;stroke:#274744;stroke-width:1.4;rx:2}.graph-node:hover rect,.graph-node:focus rect{stroke:var(--blue);stroke-width:2.5}.graph-node.selected rect{fill:#dceee1;stroke:var(--green);stroke-width:3}.graph-node.issue rect{fill:#fff0d4;stroke:var(--amber)}.edge{stroke:#69857d;stroke-width:1.5;opacity:.8}.edge.alert{stroke:var(--amber);stroke-width:2.5}.edge-label{fill:var(--ink);font-size:10px;font-weight:700}.node-label{font-size:12px;font-weight:800}.node-kind{font-size:10px;fill:var(--muted)}.node-count{font-size:10px;fill:var(--green);font-weight:800}.side{top:20px}.side .panel-head{border-bottom:1px solid var(--line);padding-bottom:14px}.detail-title{font-family:"Iowan Old Style",Georgia,serif;font-size:28px}.detail-grid{gap:0}.detail-grid>div{border-left:1px solid var(--line);padding-left:10px}.detail-grid>div:nth-child(odd){border-left:0;padding-left:0}.detail-grid b{font-family:"Iowan Old Style",Georgia,serif;font-size:26px}.run{margin-top:24px}.run-summary{border-bottom:1px solid var(--line);padding-bottom:12px}.chip{border:0;border-left:1px solid var(--line);border-radius:0;padding:2px 10px}.chip:first-child{border-left:0;padding-left:0}.finding-groups{grid-template-columns:repeat(2,minmax(0,1fr));gap:0}.finding-group{border:0;border-top:1px solid var(--line);border-radius:0;background:none;padding:16px 14px 16px 0}.finding-group:nth-child(even){padding-left:14px;border-left:1px solid var(--line)}.finding-group h3{font-size:13px;letter-spacing:.02em}.finding-detail{border-top:2px solid var(--ink)}.finding{padding:16px 0}.metadata{gap:24px;margin-top:26px}.metadata div{border-top:1px solid var(--line);padding-top:9px}.map-wrap,.panel,.finding-group,.insight{transition:background-color .16s ease,border-color .16s ease}@media(max-width:900px){.masthead{display:block}.run-meta{padding-top:24px;text-align:left}.summary{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:18px}.metric:nth-child(4){border-left:0;padding-left:0}.workspace{grid-template-columns:1fr}.side{position:static}.lens-bar{display:block}.lens-bar>.subtle{text-align:left;margin-top:10px}.finding-groups{grid-template-columns:1fr}.finding-group:nth-child(even){padding-left:0;border-left:0}}@media(max-width:560px){.shell{padding:20px 16px 40px}.masthead h1{font-size:clamp(3rem,16vw,5rem)}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(odd){border-left:0;padding-left:0}.metric:nth-child(even){border-left:1px solid var(--line);padding-left:12px}.insights{grid-template-columns:1fr}.insight,.insight:first-child{border-left:0;border-top:1px solid var(--line);padding-left:0}.insight:first-child{border-top:0}.panel{padding:16px}.panel-head{display:block}.panel-head>.tabs{margin-top:12px}.filters label{width:100%}.filters input,.filters select{width:100%}.metadata{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.map-wrap,.panel,.finding-group,.insight{transition:none}}@media(prefers-color-scheme:dark){:root{--ink:#e8eee7;--muted:#b0beb3;--paper:#131c1a;--panel:#1b2824;--line:#42534b;--green:#72d09d;--blue:#86cfe1;--amber:#f0bc6b;--red:#ff9186}.map-wrap{background-color:#17231e;background-image:linear-gradient(rgba(232,238,231,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(232,238,231,.07) 1px,transparent 1px)}.graph-node rect{fill:#1c2b25;stroke:#90aa99}.graph-node.selected rect{fill:#294936}.graph-node.issue rect{fill:#40321e}.filters input,.filters select,.filters button{background:#202f29;color:var(--ink)}}
`

styles += String.raw`.graph-node .node-label,.graph-node text.node-label{fill:var(--ink)}.graph-node .node-kind{fill:var(--muted)}.edge-label{fill:var(--ink)}@media(max-width:1100px){.workspace{grid-template-columns:1fr}.side{position:static}.map-wrap #graph{min-width:0!important;width:100%!important}.panel-head>.tabs{margin-top:12px}}@media(max-width:700px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.lens-bar{display:block}.lens-bar>.subtle{text-align:left;margin-top:10px}.filters label{width:100%}.filters input,.filters select{width:100%}.finding-groups{grid-template-columns:1fr}.finding-group:nth-child(even){padding-left:0;border-left:0}}`

styles += String.raw`.level{display:none!important}.report-tabs{display:flex;gap:0;align-items:flex-end;border-bottom:1px solid var(--line);margin:24px 0 0}.report-tabs .tab{font-size:13px}.breadcrumbs{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 14px;color:var(--muted);font-size:12px}.breadcrumbs button{border:0;background:none;color:var(--blue);padding:3px 0;font-weight:700}.breadcrumbs button:hover{text-decoration:underline}.breadcrumbs .current{color:var(--ink);font-weight:700}.scope-note{margin:0 0 12px}.report-dashboard{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,1fr);gap:24px}.report-table{width:100%;border-collapse:collapse;font-size:12px}.report-table th,.report-table td{border-top:1px solid var(--line);padding:10px 8px;text-align:left;vertical-align:top}.report-table th{color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.report-table td:first-child{font-weight:750}.bar-list{display:grid;gap:10px}.bar-item{display:grid;grid-template-columns:minmax(120px,1fr) 2fr auto;gap:10px;align-items:center;font-size:12px}.bar-item i{height:8px;background:var(--line);display:block;overflow:hidden}.bar-item i b{display:block;height:100%;background:var(--green)}.map-wrap{touch-action:none;cursor:grab}.map-wrap.dragging{cursor:grabbing}@media(max-width:700px){.report-tabs{overflow:auto}.report-tabs .tab{white-space:nowrap}.report-dashboard{grid-template-columns:1fr}.bar-item{grid-template-columns:minmax(100px,1fr) 1fr auto}}`

styles += String.raw`body[data-report-view="architecture"] #insights,body[data-report-view="architecture"] .filters,body[data-report-view="architecture"] .run,body[data-report-view="architecture"] .metadata{display:none}body[data-report-view="insights"] .workspace,body[data-report-view="insights"] .filters,body[data-report-view="insights"] .run,body[data-report-view="insights"] .metadata{display:none}body[data-report-view="findings"] .workspace,body[data-report-view="findings"] #insights,body[data-report-view="findings"] #report-dashboard,body[data-report-view="findings"] #coverage-title,body[data-report-view="findings"] #coverage-title~*{display:none}body[data-report-view="findings"] .run[aria-labelledby="coverage-title"]{display:none}body[data-report-view="coverage"] .workspace,body[data-report-view="coverage"] #insights,body[data-report-view="coverage"] #report-dashboard,body[data-report-view="coverage"] .filters,body[data-report-view="coverage"] .run[aria-labelledby="run-title"],body[data-report-view="coverage"] .metadata{display:none}body[data-report-view="insights"] #report-dashboard{display:block}body[data-report-view="map"] #report-dashboard{display:none}`
styles += String.raw`body[data-report-view="architecture"] #report-dashboard{display:none!important}.edge{fill:none}`

styles += String.raw`:root{--ink:#17251f;--muted:#586b63;--paper:#f2f5f1;--panel:#fbfcf9;--line:#c9d5cc;--green:#13734a;--blue:#155f78;--amber:#995d08;--red:#a52e2b}html,body{max-width:100%;overflow-x:hidden}body{font-size:15px;line-height:1.55}.shell{width:100%;max-width:1600px;margin:0 auto;padding:28px clamp(16px,3vw,48px) 56px}.masthead{gap:32px;padding:0 0 24px;align-items:flex-start}.masthead h1{font-size:clamp(2.8rem,5.5vw,5.4rem);line-height:.94;margin:12px 0 16px;max-width:100%;overflow-wrap:anywhere}.lede{max-width:60ch;font-size:16px}.run-meta{min-width:0;max-width:300px}.summary{margin:0;padding:18px 0 20px;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}.metric{min-width:0;padding:0 16px;border-inline-start:1px solid var(--line)}.metric:first-child{padding-inline-start:0;border-inline-start:0}.metric b{font-size:clamp(1.8rem,3vw,3rem);max-width:100%;overflow-wrap:anywhere}.metric span{font-size:10px;letter-spacing:.06em;line-height:1.25}.lens-bar{margin:24px 0 4px;align-items:flex-end}.lens-bar>.subtle{max-width:52ch}.report-tabs{max-width:100%;overflow-x:auto}.tab,.level{min-height:40px;padding:8px 12px}.filters{max-width:100%;align-items:center}.filters label{min-width:0}.filters input,.filters select{max-width:100%;min-width:0}.workspace{min-width:0;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:20px}.panel{min-width:0}.map-wrap{min-width:0;max-width:100%;width:100%;overflow:hidden;contain:layout paint}#graph{display:block;width:100%!important;min-width:0!important;max-width:100%;height:clamp(480px,60vh,680px)!important}.side{min-width:0}.detail-title,.path,.list,.finding,.finding-group,.report-table{min-width:0;overflow-wrap:anywhere}.report-dashboard{min-width:0}.report-table{table-layout:fixed}.report-table th,.report-table td{overflow-wrap:anywhere}.bar-item{min-width:0}.bar-item span{min-width:0;overflow-wrap:anywhere}.tab:focus-visible,.level:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--blue);outline-offset:2px}@media(max-width:1100px){.workspace{grid-template-columns:1fr}.side{position:static}.summary{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:16px}.summary .metric:nth-child(4){border-inline-start:0;padding-inline-start:0}}@media(max-width:700px){.shell{padding:12px 16px 32px}.masthead{padding-bottom:14px}.masthead h1{font-size:clamp(2.2rem,11vw,3.4rem);margin:6px 0 10px}.lede{font-size:14px;line-height:1.35}.run-meta{display:none}.summary{padding:10px 0 12px;grid-template-columns:repeat(2,minmax(0,1fr));row-gap:8px}.summary .metric:nth-child(even){border-inline-start:1px solid var(--line);padding-inline-start:12px}.summary .metric:nth-child(odd){border-inline-start:0;padding-inline-start:0}.metric{padding-inline:10px}.metric b{font-size:1.65rem}.lens-bar{display:block;margin-top:14px}.lens-bar>.subtle{display:none}.filters{display:grid;grid-template-columns:1fr;gap:10px}.filters label{display:grid;grid-template-columns:1fr;gap:5px}.filters input,.filters select,.filters button{width:100%;min-height:44px}.panel{padding:16px}.panel-head{display:block}.panel-head>.tabs{margin-top:12px}.finding-groups{grid-template-columns:1fr}.report-dashboard{grid-template-columns:1fr}#graph{height:520px!important}.lens-bar + #lens-caption{margin:8px 0}.lens-bar + #lens-caption + #insights{margin-top:8px}}@media(prefers-color-scheme:dark){:root{--ink:#edf5ef;--muted:#b7c6ba;--paper:#111815;--panel:#1a2821;--line:#405248;--green:#73d19d;--blue:#8bd1e6;--amber:#f0bd70;--red:#ff9389}}`

styles += String.raw`@media(max-width:700px){.map-wrap{overflow:auto;contain:layout paint}#graph{width:720px!important;min-width:720px!important;max-width:none!important}}`
styles += String.raw`.map-wrap.dense{overflow:auto}.map-wrap.dense #graph{width:2000px!important;max-width:none!important}`
styles += String.raw`#lens-caption + p.subtle{display:none}`

const script = String.raw`
const data=${'${DATA}'};
data.entities=data.entities||[];data.relations=data.relations||[];data.diagnostics=data.diagnostics||[];
const policySuffix=data.requiredRelationKinds===undefined?"Policy: all observed relation kinds require declarations.":data.requiredRelationKinds.length?"Policy: declarations required for "+data.requiredRelationKinds.join(", ")+".":"Policy: missing relation declarations disabled; stale, conflicting, and unresolved declarations remain checked.";
const ensurePolicyNote=()=>{const note=document.querySelector("#map-note");if(note&&!note.textContent.includes(policySuffix))note.textContent=(note.textContent+" · "+policySuffix).trim()};
new MutationObserver(ensurePolicyNote).observe(document.querySelector("#map-note"),{childList:true,characterData:true});
const lazyChunks=globalThis.__DOC_BRIDGE_LAZY_CHUNKS__||[],hasLevelChunks=globalThis.__DOC_BRIDGE_HAS_LEVEL_CHUNKS__===true,loadedChunks=new Set(),loadingChunks=new Map();
const esc=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;").replaceAll("'","&#39;");
const byId=new Map(),parent=new Map(),relationById=new Map(),packageMembers=new Map(),findingIndex=new Map(),relationFindingIndex=new Map(),relationsByEntity=new Map(),groupEntityIds=new Map(),groupFindingIndex=new Map(),groupFindingCounts=new Map(),packageCache=new Map(),nodeIssueCache=new Map();let graphCacheKey="",graphCache;
let activeLevelChunk="";
const groupById=new Map(Object.entries(data.view?.groups||{}));
const packageChunkNameById=new Map([...groupById.values()].flatMap((group)=>group.members).filter((id)=>data.entities.find((entity)=>entity.id===id)?.kind==="package").sort().map((id,index)=>[id,data.view?.levelChunks?.packages?.[index]]));
const addFinding=(index,id,finding)=>{const values=index.get(id)||[];values.push(finding);index.set(id,values)};
const addRelation=(id,relation)=>{const values=relationsByEntity.get(id)||[];values.push(relation);relationsByEntity.set(id,values)};
const hydrate=()=>{byId.clear();parent.clear();relationById.clear();packageMembers.clear();findingIndex.clear();relationFindingIndex.clear();relationsByEntity.clear();groupEntityIds.clear();groupFindingIndex.clear();groupFindingCounts.clear();packageCache.clear();nodeIssueCache.clear();data.entities.forEach((entity)=>{byId.set(entity.id,entity);const groupId=data.view?.entityGroup?.[entity.id];if(groupId){const ids=groupEntityIds.get(groupId)||new Set();ids.add(entity.id);groupEntityIds.set(groupId,ids)}});data.relations.forEach((relation)=>{relationById.set(relation.id,relation);addRelation(relation.from,relation);addRelation(relation.to,relation);if(relation.kind==="contains"){if(!parent.has(relation.to))parent.set(relation.to,relation.from);const members=packageMembers.get(relation.from)||new Set();members.add(relation.to);packageMembers.set(relation.from,members)}});data.diagnostics.forEach((finding)=>{(finding.entityIds||[]).forEach((id)=>addFinding(findingIndex,id,finding));(finding.relationIds||[]).forEach((id)=>addFinding(relationFindingIndex,id,finding));const scopes=data.view?.diagnosticGroup?.[finding.id]||[];scopes.forEach((scope)=>{addFinding(groupFindingIndex,scope,finding);groupFindingCounts.set(scope,(groupFindingCounts.get(scope)||0)+1)})})};
const isLevelChunk=(name)=>name.startsWith("chunks/levels-");
const isDetailChunk=(name)=>name.startsWith("chunks/details-");
const hasChunk=(name)=>isLevelChunk(name)?activeLevelChunk===name:isDetailChunk(name)?loadedChunks.has(name):!lazyChunks.includes(name)||loadedChunks.has(name);
const loadChunk=(name)=>{if(hasChunk(name))return Promise.resolve();if(loadingChunks.has(name))return loadingChunks.get(name);const promise=new Promise((resolve,reject)=>{const element=document.createElement("script");element.src=name;element.onload=()=>{try{if(isLevelChunk(name)){const payload=globalThis.__DOC_BRIDGE_LEVEL_PAYLOAD__;if(!payload)throw new Error("Offline report level payload is missing: "+name);data.entities=payload.entities||[];data.relations=payload.relations||[];activeLevelChunk=name;delete globalThis.__DOC_BRIDGE_LEVEL_PAYLOAD__}else if(isDetailChunk(name)){const payload=globalThis.__DOC_BRIDGE_DETAIL_PAYLOAD__;if(!payload)throw new Error("Offline report detail payload is missing: "+name);const entities=new Map((payload.entities||[]).map((entity)=>[entity.id,entity]));const relations=new Map((payload.relations||[]).map((relation)=>[relation.id,relation]));data.entities=data.entities.map((entity)=>entities.get(entity.id)||entity);data.relations=data.relations.map((relation)=>relations.get(relation.id)||relation);delete globalThis.__DOC_BRIDGE_DETAIL_PAYLOAD__}loadedChunks.add(name);hydrate();loadingChunks.delete(name);resolve()}catch(error){loadingChunks.delete(name);reject(error)}};element.onerror=()=>{loadingChunks.delete(name);reject(new Error("Unable to load offline report chunk: "+name))};document.head.append(element)});loadingChunks.set(name,promise);return promise};
const readHash=()=>new URLSearchParams(location.hash.slice(1));
const hash=readHash();
const state={lens:hash.get("lens")||"architecture",level:hash.get("level")||"overview",selected:hash.get("selected"),query:hash.get("query")||"",status:hash.get("status")||"",severity:hash.get("severity")||"",findingGroup:hash.get("findingGroup"),findingPage:Number(hash.get("findingPage")||0)};
const syncHash=()=>{const params=new URLSearchParams();[["lens",state.lens,"architecture"],["level",state.level,"overview"],["selected",state.selected,""],["query",state.query,""],["status",state.status,""],["severity",state.severity,""],["findingGroup",state.findingGroup,""],["findingPage",state.findingPage,"0"]].forEach(([key,value,defaultValue])=>{if(value&&value!==defaultValue)params.set(key,String(value))});const next=params.toString();try{if(location.hash.slice(1)!==next)history.replaceState(null,"",next?"#"+next:"")}catch{}};
const rootOf=(id)=>{let current=id;const seen=new Set();while(parent.has(current)&&!seen.has(current)){seen.add(current);current=parent.get(current)}return current};
const packageOf=(id)=>{if(packageCache.has(id))return packageCache.get(id);let current=id;const seen=new Set();while(current&&!seen.has(current)){seen.add(current);if(byId.get(current)?.kind==="package"){packageCache.set(id,current);return current}current=parent.get(current)}packageCache.set(id,id);return id};
const groupFor=(id)=>{const direct=data.view?.entityGroup?.[id];if(direct)return direct;const entity=byId.get(id);return entity?.kind==="module"||entity?.kind==="file"?groupFor(packageOf(id)):id};
const packageNodes=()=>data.entities.filter((entity)=>entity.kind==="package");
const viewLabels={architecture:"Architecture",drift:"Insights",risks:"Findings",evidence:"Coverage"};
const ensureReportChrome=()=>{document.querySelectorAll(".tab[data-lens]").forEach((tab)=>{tab.textContent=viewLabels[tab.dataset.lens]||tab.dataset.lens;tab.closest(".tabs")?.classList.add("report-tabs")});let breadcrumbs=document.querySelector("#breadcrumbs");if(!breadcrumbs){breadcrumbs=document.createElement("nav");breadcrumbs.id="breadcrumbs";breadcrumbs.className="breadcrumbs";breadcrumbs.setAttribute("aria-label","Report location");document.querySelector(".workspace")?.before(breadcrumbs)}return breadcrumbs};
const label=(entity)=>entity?.name||entity?.id||"Unknown";
const short=(value,max)=>{const text=String(value??""),limit=text==="External dependencies"?16:max;return text.length>limit?text.slice(0,limit-1)+"…":text};
const renderBreadcrumbs=()=>{const breadcrumbs=ensureReportChrome(),items=[{label:"Repository",selected:"",level:"overview"}];if(state.selected){const group=groupById.get(state.selected),entity=byId.get(state.selected);if(group)items.push({label:group.name,selected:group.id,level:"package"});else if(entity){const packageId=packageOf(entity.id),packageEntity=byId.get(packageId),groupId=groupFor(packageId);if(groupById.has(groupId))items.push({label:groupById.get(groupId).name,selected:groupId,level:"package"});if(packageEntity&&packageEntity.id!==entity.id)items.push({label:label(packageEntity),selected:packageEntity.id,level:"module"});items.push({label:label(entity),selected:entity.id,level:state.level})}}breadcrumbs.innerHTML=items.map((item,index)=>{const separator="<span aria-hidden=\"true\">"+(index?" / ":"")+"</span>";if(index===items.length-1)return separator+"<span class=\"current\">"+esc(item.label)+"</span>";return separator+"<button type=\"button\" data-breadcrumb-selected=\""+esc(item.selected)+"\" data-breadcrumb-level=\""+esc(item.level)+"\">"+esc(item.label)+"</button>"}).join("")};
const degreeMap=(relations)=>{const degrees=new Map();relations.forEach((relation)=>{degrees.set(relation.from,(degrees.get(relation.from)||0)+1);degrees.set(relation.to,(degrees.get(relation.to)||0)+1)});return degrees};
const relationHealth=(relation)=>{if(!relation)return "";const findings=relationFindings(relation.id);return findings.some((finding)=>finding.severity==="error")?"error":findings.length?"warn":""};
const nodeIssues=(nodeId)=>{if(nodeIssueCache.has(nodeId))return nodeIssueCache.get(nodeId);const ids=groupEntityIds.get(nodeId)||new Set([nodeId]),findings=new Set(groupFindingIndex.get(nodeId)||[]),relations=new Set();for(const id of ids){(findingIndex.get(id)||[]).forEach((finding)=>findings.add(finding));(relationsByEntity.get(id)||[]).forEach((relation)=>relations.add(relation))}relations.forEach((relation)=>(relationFindingIndex.get(relation.id)||[]).forEach((finding)=>findings.add(finding)));const result=[...findings];nodeIssueCache.set(nodeId,result);return result};
const findingInLens=(finding)=>state.lens==="architecture"||(state.lens==="drift"&&finding.status!=="confirmed")||(state.lens==="risks"&&(finding.severity==="error"||finding.severity==="warn"))||(state.lens==="evidence"&&finding.evidence.length>0);
const relationFindings=(id)=>relationFindingIndex.get(id)||data.view?.diagnosticRelationFindings?.[id]||[];
const relationInLens=(id)=>relationFindings(id).some(findingInLens);
const externalFor=(ids)=>{const externalIds=new Set();for(const id of ids)for(const relation of relationsByEntity.get(id)||[]){const other=relation.from===id?relation.to:relation.from;if(byId.get(other)?.kind==="external")externalIds.add(other)}return [...externalIds].map((id)=>byId.get(id)).filter(Boolean)};
const levelChunkName=()=>{if(state.selected&&groupById.has(state.selected))return data.view?.levelChunks?.groups?.[state.selected]||data.view?.levelChunks?.default;const selected=state.selected?byId.get(state.selected):null;const packageId=selected?.kind==="package"?selected.id:selected?packageOf(selected.id):state.selected?.startsWith("package:")?state.selected:null;const packageChunk=packageId&&packageChunkNameById.get(packageId);if(packageChunk)return packageChunk;const selectedGroup=state.selected?data.view?.entityGroup?.[state.selected]:null;if(selectedGroup&&data.view?.levelChunks?.groups?.[selectedGroup])return data.view.levelChunks.groups[selectedGroup];return data.view?.levelChunks?.default};
const detailChunkName=()=>{const entity=state.selected?byId.get(state.selected):null;const packageId=entity?.kind==="package"?entity.id:entity?packageOf(entity.id):null;const levelName=packageId&&packageChunkNameById.get(packageId);return levelName?.replace("chunks/levels-package-","chunks/details-")||null};
const nodesFor=()=>{if(state.level==="overview")return data.view?.overview?.nodes||[];const packages=packageNodes(),selectedEntity=state.selected?byId.get(state.selected):null,groupScope=state.selected&&groupById.has(state.selected)?state.selected:null,packageScope=selectedEntity?.kind==="package"?selectedEntity.id:state.selected&&!groupScope?packageOf(state.selected):null;if(state.level==="package"&&!state.selected){const packageIds=new Set(packages.map((node)=>node.id));return packages.concat(state.lens==="architecture"?[]:externalFor(packageIds))}if((state.level==="module"||state.level==="file")&&!state.selected)return[];let nodes=data.entities.filter((entity)=>{if(state.level==="package")return entity.kind==="package"&&(!groupScope||groupFor(entity.id)===groupScope)&&(!packageScope||entity.id===packageScope);if(state.level==="module")return entity.kind==="module"&&(groupScope?groupFor(entity.id)===groupScope:packageOf(entity.id)===packageScope);return Boolean(entity.path)&&(groupScope?groupFor(entity.id)===groupScope:packageOf(entity.id)===packageScope)});if(state.level==="module"&&selectedEntity?.kind==="module"){const neighborhood=new Set([selectedEntity.id]);(relationsByEntity.get(selectedEntity.id)||[]).forEach((relation)=>{if(!["imports","re-exports"].includes(relation.kind))return;if(relation.from===selectedEntity.id)neighborhood.add(relation.to);if(relation.to===selectedEntity.id)neighborhood.add(relation.from)});nodes=data.entities.filter((entity)=>entity.kind==="module"&&neighborhood.has(entity.id))}const scopedIds=new Set(nodes.map((node)=>node.id)),external=state.lens==="architecture"?[]:externalFor(scopedIds),degrees=degreeMap(data.relations);return nodes.concat(external).sort((a,b)=>(degrees.get(b.id)||0)-(degrees.get(a.id)||0)||a.id.localeCompare(b.id)).slice(0,state.level==="file"?80:60)};
const graphModelUncached=()=>{if(state.level==="overview"){const overviewNodes=data.view?.overview?.nodes||[],overviewNodeIds=new Set(overviewNodes.map((node)=>node.id)),base=(data.view?.overview?.edges||[]).filter((edge)=>overviewNodeIds.has(edge.from)&&overviewNodeIds.has(edge.to)),edges=state.lens==="architecture"?base:base.filter((edge)=>edge.relationIds.some(relationInLens)),visible=new Set(edges.flatMap((edge)=>[edge.from,edge.to]));return{nodes:state.lens==="architecture"?overviewNodes:overviewNodes.filter((node)=>visible.has(node.id)||nodeIssues(node.id).some((finding)=>findingInLens(finding))),edges:edges.map((edge)=>({...edge,health:edge.relationIds.some((id)=>relationHealth(relationById.get(id)))?"error":""}))}}const nodes=nodesFor(),ids=new Set(nodes.map((node)=>node.id)),aggregate=state.level==="package"&&(!state.selected||state.selected.startsWith("group:")),edges=new Map();data.relations.forEach((relation)=>{const essential=state.level==="package"?relation.kind==="depends-on":relation.kind==="imports"||relation.kind==="re-exports";if(relation.kind==="contains"|| (state.lens==="architecture"&&!essential)||(state.lens!=="architecture"&&!relationInLens(relation.id)))return;const from=aggregate?packageOf(relation.from):relation.from,to=aggregate?packageOf(relation.to):relation.to;if(from===to||!ids.has(from)||!ids.has(to))return;const key=from+"→"+to,current=edges.get(key)||{from,to,count:0,kinds:new Set(),relationIds:new Set(),health:""};current.count++;current.kinds.add(relation.kind);current.relationIds.add(relation.id);current.health=current.health==="error"||relationHealth(relation)==="error"?"error":current.health||relationHealth(relation);edges.set(key,current)});const visibleEdges=[...edges.values()].sort((a,b)=>b.count-a.count||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));const visible=new Set(visibleEdges.flatMap((edge)=>[edge.from,edge.to]));return{nodes:state.lens==="architecture"?nodes:nodes.filter((node)=>visible.has(node.id)||nodeIssues(node.id).some((finding)=>findingInLens(finding))),edges:visibleEdges}};
const graphModel=()=>{const key=state.lens+"|"+state.level+"|"+(state.selected||"");if(graphCacheKey===key&&graphCache)return graphCache;graphCacheKey=key;return graphCache=graphModelUncached()};
const renderInsights=()=>{const summary=data.diagnosticSummary||{},undocumented=summary.undocumented??data.diagnostics.filter((finding)=>finding.status==="undocumented").length,drift=summary.drift??data.diagnostics.filter((finding)=>finding.status==="stale-or-unverified"||finding.status==="conflict").length,unsupported=(data.coverage||[]).filter((entry)=>entry.status==="not-analyzed"||entry.status==="partial").length,model=graphModel(),degrees=degreeMap(model.edges),values=[...degrees.values()].sort((a,b)=>a-b),median=values.length?values[Math.floor(values.length/2)]:0,hot=[...degrees.values()].filter((value)=>value>=Math.max(4,median*2)).length,isolated=model.nodes.filter((node)=>!model.edges.some((edge)=>edge.from===node.id||edge.to===node.id)).length;document.querySelector("#insights").innerHTML=[["Documentation drift",undocumented+drift,"Relations or docs needing comparison.",""],["Unanalyzed scope",unsupported,"Coverage gaps are explicit.",""],["Connectivity hotspots",hot,"Heuristic: unusually connected nodes.","heuristic"],["Disconnected nodes",isolated,"Heuristic: no visible edge at this level.","heuristic"]].map(([title,count,copy,tag])=>"<article class=\"insight\"><h3>"+esc(title)+" <span class=\"tag "+tag+"\">"+(tag?"heuristic":"signal")+"</span></h3><p><strong>"+count+"</strong> · "+esc(copy)+"</p></article>").join("")};
const renderInsightsDashboard=()=>{let dashboard=document.querySelector("#report-dashboard");if(!dashboard){dashboard=document.createElement("section");dashboard.id="report-dashboard";dashboard.className="report-dashboard";document.querySelector(".filters")?.before(dashboard)}if(!data.diagnostics.length){dashboard.innerHTML="<p class=\"empty\">Open Findings or load the findings data to calculate insights.</p>";return}const degrees=degreeMap(data.relations),groups=[...groupById.entries()].filter(([,group])=>group.kind!=="external"),rows=groups.map(([id,group])=>{const members=groupEntityIds.get(id)||new Set(),modules=group.moduleCount||[...members].filter((entityId)=>byId.get(entityId)?.kind==="module").length;return{name:group.name,packages:group.members.length,modules,findings:groupFindingCounts.get(id)||0}}).sort((a,b)=>b.findings-a.findings||a.name.localeCompare(b.name)),topPackages=[...data.entities].filter((entity)=>entity.kind==="package").map((entity)=>({name:label(entity),degree:degrees.get(entity.id)||0})).sort((a,b)=>b.degree-a.degree||a.name.localeCompare(b.name)).slice(0,10),max=Math.max(1,...topPackages.map((row)=>row.degree));dashboard.innerHTML="<section><div class=\"eyebrow\">Attention by scope</div><h2>Where the map needs a closer look</h2><table class=\"report-table\"><thead><tr><th>Scope</th><th>Packages</th><th>Modules</th><th>Findings</th></tr></thead><tbody>"+rows.map((row)=>"<tr><td>"+esc(row.name)+"</td><td>"+row.packages+"</td><td>"+row.modules+"</td><td><strong>"+row.findings+"</strong></td></tr>").join("")+"</tbody></table></section><section><div class=\"eyebrow\">Connectivity</div><h2>Most connected packages</h2><div class=\"bar-list\">"+topPackages.map((row)=>"<div class=\"bar-item\"><span>"+esc(row.name)+"</span><i><b style=\"width:"+Math.round(row.degree/max*100)+"%\"></b></i><strong>"+row.degree+"</strong></div>").join("")+"</div></section>"};
const mapState={scale:1,dragging:false,x:0,y:0};
const applyMapTransform=()=>{const svg=document.querySelector("#graph");if(!svg)return;const dense=svg.closest(".map-wrap")?.classList.contains("dense");svg.setAttribute("preserveAspectRatio",dense?"xMinYMin meet":"xMidYMid meet");svg.style.transform="translate("+mapState.x+"px,"+mapState.y+"px) scale("+mapState.scale+")";svg.style.transformOrigin="center center"};
const routeGraphEdges=()=>{const svg=document.querySelector("#graph");if(!svg)return;svg.querySelectorAll("line.edge").forEach((line,index)=>{const x1=Number(line.getAttribute("x1")),y1=Number(line.getAttribute("y1")),x2=Number(line.getAttribute("x2")),y2=Number(line.getAttribute("y2")),midX=(x1+x2)/2+((index%5)-2)*14,path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("class",line.getAttribute("class")||"edge");path.setAttribute("fill","none");path.setAttribute("marker-end",line.getAttribute("marker-end")||"url(#arrow)");path.setAttribute("d","M "+x1+" "+y1+" H "+midX+" V "+y2+" H "+x2);const label=line.parentElement?.querySelector("text.edge-label");if(label){label.setAttribute("x",String(midX+3));label.setAttribute("y",String((y1+y2)/2))}line.replaceWith(path)})};
const enterNode=(id)=>{const group=groupById.get(id),entity=byId.get(id);if(group){state.selected=id;state.level="package"}else if(entity?.kind==="package"){state.selected=id;state.level="module"}else if(entity?.kind==="module"){state.selected=id;state.level="file"}else return;mapState.scale=1;mapState.x=0;mapState.y=0;render()};
let nodeClickTimer;
document.addEventListener("dblclick",(event)=>{const node=event.target.closest?.("[data-node]");if(!node)return;event.preventDefault();event.stopImmediatePropagation();clearTimeout(nodeClickTimer);enterNode(node.dataset.node)},true);
document.addEventListener("click",(event)=>{const node=event.target.closest?.("[data-node]");if(!node)return;event.preventDefault();event.stopImmediatePropagation();clearTimeout(nodeClickTimer);nodeClickTimer=setTimeout(async()=>{state.selected=node.dataset.node;render();const chunk=detailChunkName();if(chunk&&!hasChunk(chunk)){await loadChunk(chunk);render()}},380)},true);
document.addEventListener("click",(event)=>{const crumb=event.target.closest?.("[data-breadcrumb-level]");if(!crumb)return;event.preventDefault();event.stopImmediatePropagation();state.level=crumb.dataset.breadcrumbLevel;state.selected=crumb.dataset.breadcrumbSelected||null;mapState.scale=1;mapState.x=0;mapState.y=0;render()},true);
const diagnosticsFor=(id)=>findingIndex.get(id)||[];
const renderDetails=()=>{const panel=document.querySelector("#details"),entity=state.selected?byId.get(state.selected):null,group=state.selected?groupById.get(state.selected):null;if(group){const members=group.members.map((id)=>byId.get(id)).filter(Boolean),relations=new Set(),ids=groupEntityIds.get(state.selected)||new Set();ids.forEach((id)=>(relationsByEntity.get(id)||[]).forEach((relation)=>relations.add(relation)));const findings=nodeIssues(state.selected),evidence=members.flatMap((member)=>member.evidence||[]).slice(0,8),unit=group.kind==="external"?"dependencies":"packages";panel.innerHTML="<div class=\"eyebrow\">Selected group</div><h2 class=\"detail-title\">"+esc(group.name)+"</h2><span class=\"tag\">"+esc(group.kind)+"</span><p class=\"path\">"+esc(group.path||"Derived from stable package identity and repository structure")+"</p><div class=\"detail-grid\"><div><b>"+members.length+"</b><span>"+unit+"</span></div><div><b>"+relations.size+"</b><span>relations</span></div><div><b>"+findings.length+"</b><span>findings</span></div><div><b>"+evidence.length+"</b><span>evidence items</span></div></div><h3>Members</h3><ul class=\"list\">"+(members.length?members.slice(0,8).map((member)=>"<li>"+esc(label(member))+"</li>").join(""):"<li>No members recorded.</li>")+(members.length>8?"<li class=\"subtle\">+"+(members.length-8)+" more — choose Package level to inspect all.</li>":"")+"</ul>"+(findings.length?"<h3 style=\"margin-top:16px\">Attention</h3><ul class=\"list\">"+findings.slice(0,5).map((finding)=>"<li><span class=\"tag "+esc(finding.severity)+"\">"+esc(finding.severity)+"</span> "+esc(finding.code)+"</li>").join("")+"</ul>":"");return}if(!entity){panel.innerHTML="<p class=\"subtle\">Select a node in the map to inspect its evidence, connectivity, and findings.</p>";return}const relations=relationsByEntity.get(entity.id)||[],incoming=relations.filter((relation)=>relation.to===entity.id),outgoing=relations.filter((relation)=>relation.from===entity.id),findings=diagnosticsFor(entity.id),evidence=[...(entity.evidence||[]),...incoming.flatMap((relation)=>relation.evidence||[]),...outgoing.flatMap((relation)=>relation.evidence||[])].slice(0,8);panel.innerHTML="<div class=\"eyebrow\">Selected entity</div><h2 class=\"detail-title\">"+esc(label(entity))+"</h2><span class=\"tag\">"+esc(entity.kind)+"</span><p class=\"path\">"+esc(entity.path||entity.id)+"</p><div class=\"detail-grid\"><div><b>"+incoming.length+"</b><span>incoming</span></div><div><b>"+outgoing.length+"</b><span>outgoing</span></div><div><b>"+findings.length+"</b><span>findings</span></div><div><b>"+evidence.length+"</b><span>evidence items</span></div></div><h3>Evidence</h3><ul class=\"list\">"+(evidence.length?evidence.map((item)=>"<li>"+esc(item.path+(item.lineStart?":"+item.lineStart:"")+(item.context?" — "+item.context:""))+"</li>").join(""):"<li>No evidence recorded.</li>")+"</ul>"+(findings.length?"<h3 style=\"margin-top:16px\">Attention</h3><ul class=\"list\">"+findings.slice(0,5).map((finding)=>"<li><span class=\"tag "+esc(finding.severity)+"\">"+esc(finding.severity)+"</span> "+esc(finding.code)+"</li>").join("")+"</ul>":"")};
const renderGraph=()=>{const model=graphModel(),svg=document.querySelector("#graph"),dense=model.edges.length>64,edges=dense?[...model.edges].sort((a,b)=>(b.health?1:0)-(a.health?1:0)||b.count-a.count||a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).slice(0,64):model.edges;if(!model.nodes.length){svg.innerHTML="<text x=\"500\" y=\"270\" text-anchor=\"middle\" class=\"subtle\">Select an app or package to expand this view.</text>";return}const ids=new Set(model.nodes.map((node)=>node.id)),incoming=new Map(model.nodes.map((node)=>[node.id,0])),outgoing=new Map(model.nodes.map((node)=>[node.id,[]]));edges.forEach((edge)=>{if(!ids.has(edge.from)||!ids.has(edge.to))return;incoming.set(edge.to,(incoming.get(edge.to)||0)+1);outgoing.get(edge.from).push(edge.to)});const rank=new Map(),work=[];model.nodes.filter((node)=>(incoming.get(node.id)||0)===0).sort((a,b)=>label(a).localeCompare(label(b))||a.id.localeCompare(b.id)).forEach((node)=>{rank.set(node.id,0);work.push(node)});for(let index=0;index<work.length;index++){const node=work[index];for(const next of outgoing.get(node.id)||[]){const nextRank=Math.max(rank.get(next)||0,(rank.get(node.id)||0)+1);rank.set(next,nextRank);if(!work.some((item)=>item.id===next))work.push(byId.get(next)||{id:next,name:next})}}model.nodes.forEach((node)=>{if(!rank.has(node.id))rank.set(node.id,0)});const columns=new Map();model.nodes.forEach((node)=>{const items=columns.get(rank.get(node.id))||[];items.push(node);columns.set(rank.get(node.id),items)});for(const items of columns.values())items.sort((a,b)=>label(a).localeCompare(label(b))||a.id.localeCompare(b.id));if(dense){columns.clear();model.nodes.forEach((node,index)=>{const column=Math.floor(index/8),items=columns.get(column)||[];items.push(node);columns.set(column,items)})}const maxRows=Math.max(1,...[...columns.values()].map((items)=>items.length)),cellWidth=190,cellHeight=82,pad=28,columnCount=Math.max(1,...columns.keys())+1,width=Math.max(620,columnCount*cellWidth+pad*2,Math.min(1000,svg.clientWidth*1.05)),height=Math.max(520,maxRows*cellHeight+pad*2);svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.style.width=dense?Math.max(1000,width)+"px":"100%";svg.style.minWidth="0";svg.style.height="100%";document.querySelector(".map-wrap")?.classList.toggle("dense",dense);const positions=new Map();for(const [column,items] of columns)items.forEach((node,row)=>positions.set(node.id,{x:pad+column*cellWidth+78,y:pad+row*cellHeight+27}));const defs="<defs><marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"3\" orient=\"auto\"><path d=\"M0,0 L0,6 L7,3 z\" fill=\"#789087\"/></marker></defs>",edgeMarkup=edges.map((edge)=>{const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)return "";const midX=(from.x+to.x)/2,midY=(from.y+to.y)/2;return "<g><line class=\"edge "+(edge.health?"alert":"")+"\" x1=\""+from.x+"\" y1=\""+from.y+"\" x2=\""+to.x+"\" y2=\""+to.y+"\" marker-end=\"url(#arrow)\"/><text class=\"edge-label\" x=\""+midX+"\" y=\""+midY+"\">"+esc(edge.count>1?edge.count+"×":"")+"</text></g>"}).join(""),nodes=model.nodes.map((node)=>{const pos=positions.get(node.id),issues=nodeIssues(node.id),degree=degreeMap(edges).get(node.id)||0,selected=state.selected===node.id?" selected":"",issue=issues.length?" issue":"",nodeLabel=label(node),nodeKind=node.kind==="domain"?(node.memberCount||0)+" packages":node.kind;return "<g class=\"graph-node"+selected+issue+"\" transform=\"translate("+(pos.x-78)+","+(pos.y-27)+")\"><title>"+esc(nodeLabel)+" · "+esc(nodeKind)+"</title><rect width=\"156\" height=\"54\" rx=\"8\" role=\"button\" tabindex=\"0\" aria-label=\""+esc(nodeLabel+" "+nodeKind)+"\" data-node=\""+esc(node.id)+"\"></rect><text class=\"node-label\" x=\"10\" y=\"19\">"+esc(short(nodeLabel,22))+"</text><text class=\"node-kind\" x=\"10\" y=\"34\">"+esc(short(nodeKind,22))+"</text><text class=\"node-count\" x=\"144\" y=\"19\" text-anchor=\"end\">"+(degree||"")+"</text></g>"}).join("");svg.innerHTML=defs+edgeMarkup+nodes;routeGraphEdges();applyMapTransform();document.querySelector("#map-note").textContent=(state.level==="overview"?"Bounded domain view. ":state.level+" view. ")+"Directional edges are aggregated from canonical relations; "+model.edges.length+" visible connection groups"+(dense?" (showing "+edges.length+" prioritized of "+model.edges.length+").":".");};
const findingMatches=(finding)=>{const query=state.query.toLowerCase();return(!query||[finding.id,finding.code,finding.message,...finding.entityIds,...finding.relationIds].join(" ").toLowerCase().includes(query))&&(!state.status||finding.status===state.status)&&(!state.severity||finding.severity===state.severity)};
const findingScope=(finding)=>data.view?.diagnosticGroup?.[finding.id]?.[0]||(()=>{const ids=[...(finding.entityIds||[])];(finding.relationIds||[]).forEach((id)=>{const relation=relationById.get(id);if(relation)ids.push(relation.from,relation.to)});return ids.map(groupFor).sort()[0]||"repository"})();
const findingGroups=(findings)=>{const groups=new Map();findings.forEach((finding)=>{const scope=findingScope(finding),key=[scope,finding.code,finding.status,finding.severity].join("|"),group=groups.get(key)||{key,scope,code:finding.code,status:finding.status,severity:finding.severity,findings:[]};group.findings.push(finding);groups.set(key,group)});return[...groups.values()].sort((left,right)=>right.findings.length-left.findings.length||left.code.localeCompare(right.code)||left.key.localeCompare(right.key))};
const renderFinding=(finding)=>"<article class=\"finding\" id=\""+esc("diagnostic-"+finding.id.replace(/[^A-Za-z0-9_-]+/g,"-"))+"\"><div class=\"finding-head\"><h3>"+esc(finding.code)+"</h3><span><span class=\"tag "+esc(finding.severity)+"\">"+esc(finding.severity)+"</span> <span class=\"tag\">"+esc(finding.status)+"</span></span></div><p>"+esc(finding.message)+"</p>"+(finding.evidence.length?"<ul>"+finding.evidence.slice(0,4).map((item)=>"<li>"+esc(item.path+(item.lineStart?":"+item.lineStart:"")+(item.context?" — "+item.context:""))+"</li>").join("")+"</ul>":"")+(finding.remediation?"<p><strong>Next check:</strong> "+esc(finding.remediation)+"</p>":"")+"</article>";
const renderFindings=()=>{let findings=data.diagnostics.filter(findingMatches);if(state.lens==="risks")findings=findings.filter((finding)=>finding.severity==="error"||finding.severity==="warn");if(state.lens==="evidence")findings=findings.filter((finding)=>finding.evidence.length);if(state.lens==="drift")findings=findings.filter((finding)=>finding.status!=="confirmed");const groups=findingGroups(findings),active=groups.find((group)=>group.key===state.findingGroup);if(!active){state.findingGroup=null;state.findingPage=0}syncHash();const selected=active||null,pageSize=40,pageCount=selected?Math.ceil(selected.findings.length/pageSize):0,page=Math.max(0,Math.min(state.findingPage,Math.max(0,pageCount-1))),start=page*pageSize;document.querySelector("#finding-count").textContent=findings.length+" findings · "+groups.length+" groups";document.querySelector("#findings").innerHTML=findings.length?"<div class=\"finding-groups\">"+groups.map((group)=>"<article class=\"finding-group\"><div class=\"finding-head\"><h3>"+esc(group.code)+"</h3><span><span class=\"tag "+esc(group.severity)+"\">"+esc(group.severity)+"</span> <span class=\"tag\">"+esc(group.status)+"</span></span></div><p><strong>"+group.findings.length+"</strong> finding"+(group.findings.length===1?"":"s")+" · "+esc(groupById.get(group.scope)?.name||group.scope)+"</p><p>"+esc(group.findings[0].message)+"</p><button class=\"tab\" type=\"button\" data-finding-group=\""+esc(group.key)+"\" aria-expanded=\""+String(selected?.key===group.key)+"\">Inspect group</button></article>").join("")+"</div>"+(selected?"<div class=\"finding-detail\"><div class=\"finding-head\"><h3>"+esc(selected.code)+" · "+esc(groupById.get(selected.scope)?.name||selected.scope)+"</h3><span class=\"subtle\">"+selected.findings.length+" total</span></div>"+selected.findings.slice(start,start+pageSize).map(renderFinding).join("")+"<div class=\"finding-actions\"><button class=\"tab\" type=\"button\" data-finding-group=\""+esc(selected.key)+"\" data-finding-page=\""+(page-1)+"\" "+(page===0?"disabled":"")+">Previous</button><span class=\"subtle\">Showing "+(start+1)+"–"+Math.min(start+pageSize,selected.findings.length)+" of "+selected.findings.length+" · page "+(page+1)+"/"+pageCount+"</span><button class=\"tab\" type=\"button\" data-finding-group=\""+esc(selected.key)+"\" data-finding-page=\""+(page+1)+"\" "+(page+1>=pageCount?"disabled":"")+">Next</button></div></div>":""):"<p class=\"empty\">No findings match the current lens and filters.</p>"};
const renderCoverage=()=>{document.querySelector("#coverage-list").innerHTML=(data.coverage||[]).map((entry)=>{const width=entry.status==="complete"?100:entry.status==="partial"?55:12;return"<div class=\"coverage-row\"><div><b>"+esc(entry.analyzer)+"</b><br><span class=\"subtle\">"+esc(entry.scope)+"</span></div><div class=\"bar\"><i class=\""+(entry.status==="complete"?"":entry.status==="partial"?"partial":"none")+"\" style=\"width:"+width+"%\"></i></div><div>"+esc(entry.status)+"</div></div>"}).join("")||"<p class=\"empty\">No coverage metadata.</p>"};
const deferFindings=()=>{if(findingsLoaded())return;const count=data.diagnosticCount||0;document.querySelector("#finding-count").textContent=count+" findings · available on demand";document.querySelector("#findings").innerHTML="<div class=\"empty\"><p>Findings stay out of the first paint so large repositories remain responsive.</p><button id=\"load-findings\" class=\"tab\" type=\"button\">Load findings</button></div>"};
const scopePrompt=()=>{if((state.level==="module"||state.level==="file")&&!state.selected){document.querySelector("#map-note").textContent="Select an app or package to inspect this level.";document.querySelector("#graph").innerHTML="<text x=\"500\" y=\"270\" text-anchor=\"middle\" class=\"subtle\">Select an app or package to expand this view.</text>"}};
const findingsLoaded=()=>!lazyChunks.includes("chunks/findings.js")||loadedChunks.has("chunks/findings.js");
const levelsLoaded=()=>!hasLevelChunks||state.level==="overview"||activeLevelChunk===levelChunkName();
const setReportView=()=>{document.body.dataset.reportView={architecture:"architecture",drift:"insights",risks:"findings",evidence:"coverage"}[state.lens]||"architecture";ensureReportChrome()};
const measureRender=(name,renderFn)=>{const started=performance.now(),value=renderFn(),timings=JSON.parse(document.documentElement.dataset.docBridgeRenderTimings||"{}");timings[name]=Math.round(performance.now()-started);document.documentElement.dataset.docBridgeRenderTimings=JSON.stringify(timings);return value};
const render=()=>{if(state.level!=="overview"&&!levelsLoaded()){document.querySelector("#map-note").textContent="Loading canonical entities…";loadChunk(levelChunkName()).then(render).catch((error)=>{document.querySelector("#map-note").textContent=error.message});return}if(state.lens!=="architecture"&&!findingsLoaded()){document.querySelector("#lens-caption").textContent="Loading findings for this lens…";loadChunk("chunks/findings.js").then(render).catch((error)=>{document.querySelector("#lens-caption").textContent=error.message});return}syncHash();setReportView();renderBreadcrumbs();document.querySelectorAll(".tab[data-lens]").forEach((tab)=>tab.setAttribute("aria-selected",String(tab.dataset.lens===state.lens)));document.querySelectorAll(".level").forEach((button)=>button.setAttribute("aria-pressed",String(button.dataset.level===state.level)));document.querySelector("#lens-caption").textContent=state.lens==="architecture"?"The repository topology at the selected level.":state.lens==="drift"?"Where canonical code relations and documentation declarations need attention.":state.lens==="risks"?"Signals that deserve human review; connectivity warnings are heuristics, not architectural proof.":"What the analyzers observed, declared, or could not analyze.";document.documentElement.dataset.docBridgeRenderTimings="{}";measureRender("insights",renderInsights);if(state.lens!=="architecture")measureRender("insightsDashboard",renderInsightsDashboard);measureRender("graph",renderGraph);measureRender("details",renderDetails);if(state.lens!=="architecture")measureRender("findings",renderFindings);else document.querySelector("#findings")?.replaceChildren();deferFindings();measureRender("coverage",renderCoverage)};
document.addEventListener("click",async(event)=>{const target=event.target.closest?.("[data-level],[data-lens],#load-findings");if(!target)return;if(target.id==="load-findings"){event.preventDefault();event.stopImmediatePropagation();await loadChunk("chunks/findings.js");render();return}if(target.dataset.level&&!levelsLoaded()){event.preventDefault();event.stopImmediatePropagation();state.level=target.dataset.level;await loadChunk(levelChunkName());render();return}if(target.dataset.lens&&target.dataset.lens!=="architecture"&&!findingsLoaded()){event.preventDefault();event.stopImmediatePropagation();state.lens=target.dataset.lens;state.findingGroup=null;await loadChunk("chunks/findings.js");render()}},true);
document.addEventListener("click",(event)=>{const crumb=event.target.closest?.("[data-breadcrumb-level]");if(!crumb)return;event.preventDefault();event.stopImmediatePropagation();state.level=crumb.dataset.breadcrumbLevel;state.selected=crumb.dataset.breadcrumbSelected||null;mapState.scale=1;mapState.x=0;mapState.y=0;render()},true);
document.addEventListener("input",async(event)=>{const target=event.target;if(target?.id!=="search"||findingsLoaded())return;event.stopImmediatePropagation();state.query=target.value;state.findingGroup=null;await loadChunk("chunks/findings.js");render()},true);
document.addEventListener("change",async(event)=>{const target=event.target;if(!["status","severity"].includes(target?.id)||findingsLoaded())return;event.stopImmediatePropagation();state[target.id]=target.value;state.findingGroup=null;await loadChunk("chunks/findings.js");render()},true);
document.addEventListener("wheel",(event)=>{const wrap=event.target.closest?.(".map-wrap");if(!wrap)return;event.preventDefault();mapState.scale=Math.max(.65,Math.min(2.5,mapState.scale*(event.deltaY<0?1.12:.89)));applyMapTransform()},{passive:false});
document.addEventListener("pointerdown",(event)=>{const wrap=event.target.closest?.(".map-wrap");if(!wrap)return;mapState.dragging=true;mapState.lastX=event.clientX;mapState.lastY=event.clientY;wrap.classList.add("dragging")},true);
document.addEventListener("pointermove",(event)=>{if(!mapState.dragging)return;mapState.x+=event.clientX-mapState.lastX;mapState.y+=event.clientY-mapState.lastY;mapState.lastX=event.clientX;mapState.lastY=event.clientY;applyMapTransform()});
document.addEventListener("pointerup",()=>{mapState.dragging=false;document.querySelector(".map-wrap")?.classList.remove("dragging")},true);
document.addEventListener("keydown",(event)=>{if(event.target.matches?.("input,select,textarea"))return;if(event.key==="+"||event.key==="="){mapState.scale=Math.min(2.5,mapState.scale*1.15);applyMapTransform()}if(event.key==="-"){mapState.scale=Math.max(.65,mapState.scale*.87);applyMapTransform()}if(event.key==="0"){mapState.scale=1;mapState.x=0;mapState.y=0;applyMapTransform()}if(event.key==="Escape"){if(state.selected){state.selected=null}else if(state.level==="file"){state.level="module"}else if(state.level==="module"){state.level="package"}else if(state.level==="package"){state.level="overview"}render()}},true);
document.querySelectorAll(".tab[data-lens]").forEach((tab)=>tab.addEventListener("click",()=>{state.lens=tab.dataset.lens;state.findingGroup=null;render()}));
document.querySelectorAll(".level").forEach((button)=>button.addEventListener("click",()=>{state.level=button.dataset.level;render()}));
document.querySelector("#search").addEventListener("input",(event)=>{state.query=event.target.value;state.findingGroup=null;renderFindings()});
document.querySelector("#status").addEventListener("change",(event)=>{state.status=event.target.value;state.findingGroup=null;renderFindings()});
document.querySelector("#severity").addEventListener("change",(event)=>{state.severity=event.target.value;state.findingGroup=null;renderFindings()});
document.querySelector("#findings").addEventListener("click",(event)=>{const button=event.target.closest("[data-finding-group]");if(!button)return;state.findingGroup=button.dataset.findingGroup;state.findingPage=Number(button.dataset.findingPage||0);renderFindings()});
document.querySelector("#reset").addEventListener("click",()=>{state.query="";state.status="";state.severity="";state.findingGroup=null;state.findingPage=0;renderFindings()});
document.querySelector("#clear-selection").addEventListener("click",()=>{state.selected=null;render()});
const keepMobileGraphReadable=()=>{const svg=document.querySelector("#graph");if(!svg)return;if(window.innerWidth<=700){svg.style.setProperty("width","720px","important");svg.style.setProperty("min-width","720px","important");svg.style.setProperty("max-width","none","important")}else{svg.style.removeProperty("width");svg.style.removeProperty("min-width");svg.style.removeProperty("max-width")}};
new MutationObserver(keepMobileGraphReadable).observe(document.querySelector("#graph"),{attributes:true,attributeFilter:["style"]});
window.addEventListener("resize",keepMobileGraphReadable);
window.addEventListener("hashchange",()=>{const next=readHash();state.lens=next.get("lens")||"architecture";state.level=next.get("level")||"overview";state.selected=next.get("selected");state.query=next.get("query")||"";state.status=next.get("status")||"";state.severity=next.get("severity")||"";state.findingGroup=next.get("findingGroup");state.findingPage=Number(next.get("findingPage")||0);render()});
hydrate();render();keepMobileGraphReadable();ensurePolicyNote();
`;

type InternalOfflineReportOptions = OfflineReportOptions & {
  readonly dataExpression?: string
  readonly dataScripts?: string
}

const render = (input: OfflineReportInput, options: InternalOfflineReportOptions): string => {
  const { snapshot, report } = input
  const includeSnippets = options.includeSnippets === true
  const data = reportData(snapshot, report, includeSnippets, options.privacy)
  const scriptBody = script.replace('${' + 'DATA}', options.dataExpression ?? embeddedJson(data))
  const largeNote = snapshot.entities.length > 500 || report.diagnostics.length > 1_000
    ? 'Large snapshots are rendered from compact canonical data with progressive graph levels.'
    : 'The viewer starts with a grouped topology and expands into canonical entities on demand.'
  const issueCount = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error' || diagnostic.severity === 'warn').length
  const unsupportedCount = snapshot.coverage.filter((entry) => entry.status !== 'complete').length
  const policyNote = report.summary.requiredRelationKinds === undefined
    ? 'Missing relation declarations are checked for every observed relation kind.'
    : report.summary.requiredRelationKinds.length
      ? `Missing relation declarations are checked for: ${report.summary.requiredRelationKinds.join(', ')}.`
      : 'Missing relation declarations are disabled by configuration; stale, conflicting, and unresolved declarations remain checked.'
  const statusOptions = ['confirmed', 'undocumented', 'stale-or-unverified', 'conflict', 'unresolved', 'not-analyzed']
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doc Bridge — ${escapeHtml(data.project.name)}</title><style>${styles}</style></head><body>${options.dataScripts ?? ''}<main class="shell"><header class="masthead"><div><div class="eyebrow">Doc Bridge / Knowledge report</div><h1>${escapeHtml(data.project.name)}</h1><p class="lede">A read-only architecture and documentation map. Start broad, then follow evidence to the exact entity, relation, or finding.</p></div><div class="run-meta"><span class="read-only">Read-only snapshot</span><strong>${escapeHtml(data.revision)}</strong><span>${escapeHtml(data.revisionKind)} · pipeline ${escapeHtml(data.pipelineVersion)}</span></div></header><section class="summary" aria-label="Snapshot summary"><div class="metric"><b>${snapshot.entities.length}</b><span>entities</span></div><div class="metric"><b>${snapshot.relations.length}</b><span>canonical relations</span></div><div class="metric ${issueCount?'warn':''}"><b>${issueCount}</b><span>warn/error findings</span></div><div class="metric ${report.diagnostics.length?'warn':''}"><b>${report.diagnostics.length}</b><span>total findings</span></div><div class="metric ${unsupportedCount?'bad':''}"><b>${unsupportedCount}</b><span>partial / unanalyzed scopes</span></div></section><div class="lens-bar"><nav class="tabs" aria-label="Report lenses"><button class="tab" data-lens="architecture" aria-selected="true">Architecture</button><button class="tab" data-lens="drift" aria-selected="false">Documentation drift</button><button class="tab" data-lens="risks" aria-selected="false">Risks &amp; hotspots</button><button class="tab" data-lens="evidence" aria-selected="false">Evidence</button></nav><span class="subtle">${escapeHtml(largeNote)}</span></div><p id="lens-caption" class="subtle">The repository topology at the selected level.</p><p class="subtle">${escapeHtml(policyNote)}</p><section id="insights" class="insights" aria-label="Attention signals"></section><section class="filters" aria-label="Finding filters"><label>Search <input id="search" type="search" placeholder="Press / to search findings"></label><label>Status <select id="status"><option value="">Any status</option>${statusOptions.map((value) => `<option>${escapeHtml(value)}</option>`).join('')}</select></label><label>Severity <select id="severity"><option value="">Any severity</option><option>error</option><option>warn</option><option>info</option></select></label><button id="reset" type="button">Reset filters</button></section><div class="workspace"><section class="panel" aria-labelledby="architecture-title"><div class="panel-head"><div><h2 id="architecture-title">Architecture map</h2><p id="map-note" class="subtle">Grouped package/external view.</p></div><div class="tabs" aria-label="Graph level"><button class="level" data-level="overview" aria-pressed="true">Overview</button><button class="level" data-level="package" aria-pressed="false">Package</button><button class="level" data-level="module" aria-pressed="false">Module</button><button class="level" data-level="file" aria-pressed="false">File</button></div></div><div class="map-wrap"><svg id="graph" viewBox="0 0 1000 560" role="img" aria-label="Interactive architecture graph"></svg></div><p class="subtle">Node number = visible connection degree. Amber nodes/edges have findings. Click or focus a node to inspect its evidence, connectivity, and findings. Grouped edges preserve canonical relation direction and count.</p></section><aside class="panel side" aria-labelledby="details-title"><div class="panel-head"><div><div class="eyebrow">Evidence trail</div><h2 id="details-title">Details</h2></div><button id="clear-selection" class="tab" type="button">Clear</button></div><div id="details"><p class="subtle">Select a node in the map to inspect its evidence, connectivity, and findings.</p></div></aside></div><section class="panel run" aria-labelledby="run-title"><div class="panel-head"><div><div class="eyebrow">Jest-like diagnostics</div><h2 id="run-title">Run report</h2></div><span id="finding-count" class="subtle">${report.diagnostics.length} shown</span></div><div class="run-summary"><span class="chip"><b>${report.diagnostics.filter((item) => item.severity === 'error').length}</b> errors</span><span class="chip"><b>${report.diagnostics.filter((item) => item.severity === 'warn').length}</b> warnings</span><span class="chip"><b>${report.diagnostics.filter((item) => item.status === 'undocumented').length}</b> undocumented</span><span class="chip"><b>${report.diagnostics.filter((item) => item.status === 'stale-or-unverified' || item.status === 'conflict').length}</b> drift/conflict</span></div><div id="findings"></div></section><section class="panel run" aria-labelledby="coverage-title"><div class="panel-head"><div><div class="eyebrow">Analyzer boundaries</div><h2 id="coverage-title">Coverage &amp; unsupported areas</h2></div><span class="subtle">Explicit limits are part of the evidence</span></div><div id="coverage-list"></div></section><section class="metadata" aria-label="Run metadata"><div><b>Snapshot</b>${escapeHtml(data.snapshotHash)}</div><div><b>Report</b>${escapeHtml(data.reportHash)}</div><div><b>Configuration</b>${escapeHtml(data.configurationHash)}</div><div><b>Analyzers</b>${escapeHtml(Object.entries(data.analyzerVersions).map(([name, version]) => `${name} ${version}`).join(', '))}</div><div><b>Source revision</b>${escapeHtml(data.revision)} (${escapeHtml(data.revisionKind)})</div><div><b>Mode</b>${options.privacy === 'anonymized' ? 'Anonymized read-only browser viewer; evidence paths and project identity are redacted.' : 'Read-only browser viewer; approvals and fixes remain outside this artifact.'}</div></section></main><script>${scriptBody}</script></body></html>`
}

const parseReportInput = (input: unknown): OfflineReportInput => {
  if (!input || typeof input !== 'object') throw new Error('Input must contain snapshot and report artifacts.')
  const value = input as Partial<OfflineReportInput>
  const snapshot = DiscoverySnapshotV1Schema.parse(value.snapshot)
  const report = ReconciliationReportV1Schema.parse(value.report)
  if (report.snapshotHash !== snapshot.contentHash) throw new Error('Report snapshotHash does not match snapshot contentHash.')
  return { snapshot, report }
}

const chunkScript = (payload: unknown): string => `globalThis.__DOC_BRIDGE_DATA__=Object.assign(globalThis.__DOC_BRIDGE_DATA__||{},${embeddedJson(payload)});`
const levelChunkScript = (payload: unknown): string => `globalThis.__DOC_BRIDGE_LEVEL_PAYLOAD__=${embeddedJson(payload)};`
const detailChunkScript = (payload: unknown): string => `globalThis.__DOC_BRIDGE_DETAIL_PAYLOAD__=${embeddedJson(payload)};`
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength

export const renderOfflineReport = (input: unknown, options: OfflineReportOptions = {}): string => {
  try {
    return render(parseReportInput(input), options)
  } catch (error) {
    return errorPage(error instanceof Error ? error.message : String(error))
  }
}

export const renderOfflineReportArtifact = (input: unknown, options: OfflineReportOptions & { readonly thresholdBytes?: number } = {}): OfflineReportArtifact => {
  const parsed = parseReportInput(input)
  const thresholdBytes = options.thresholdBytes ?? DEFAULT_LARGE_REPORT_THRESHOLD_BYTES
  const renderOptions = { includeSnippets: options.includeSnippets === true, privacy: options.privacy ?? 'private', thresholdBytes }
  const singleFile = render(parsed, options)
  if (byteLength(singleFile) <= thresholdBytes) {
    const files = { 'index.html': sha256NormalizedV1(singleFile) }
    const manifestPayload = { schemaVersion: 1, mode: 'single-file', generatedBy: '@agentskit/doc-bridge', snapshotHash: parsed.snapshot.contentHash, reportHash: parsed.report.contentHash, configurationHash: parsed.snapshot.configurationHash, sourceRevision: options.privacy === 'anonymized' ? 'redacted' : parsed.snapshot.sourceRevision, renderOptions, files }
    const manifest = JSON.stringify({ ...manifestPayload, artifactHash: sha256NormalizedV1(manifestPayload) }, null, 2)
    return { mode: 'single-file', indexHtml: singleFile, files: { 'index.html': singleFile }, manifest }
  }

  const data = reportData(parsed.snapshot, parsed.report, options.includeSnippets === true, options.privacy)
  const entitiesById = new Map(data.entities.map((entity) => [entity.id, entity]))
  const packageEntities = data.entities.filter((entity) => entity.kind === 'package')
  const packageIds = new Set(packageEntities.map((entity) => entity.id))
  const packageRelations = data.relations.filter((relation) => packageIds.has(relation.from) && packageIds.has(relation.to))
  const diagnosticGroup = Object.fromEntries(data.diagnostics.map((diagnostic) => {
    const groups = new Set<string>()
    for (const entityId of diagnostic.entityIds ?? []) {
      const groupId = data.view.entityGroup[entityId]
      if (groupId) groups.add(groupId)
    }
    for (const relationId of diagnostic.relationIds ?? []) {
      const relation = data.relations.find((candidate) => candidate.id === relationId)
      if (!relation) continue
      for (const endpoint of [relation.from, relation.to]) {
        const groupId = data.view.entityGroup[endpoint]
        if (groupId) groups.add(groupId)
      }
    }
    return [diagnostic.id, [...groups].sort()] as const
  }))
  const diagnosticRelationFindings = new Map<string, { status: string; severity: string }[]>()
  for (const diagnostic of data.diagnostics) {
    for (const relationId of diagnostic.relationIds ?? []) {
      const findings = diagnosticRelationFindings.get(relationId) ?? []
      findings.push({ status: diagnostic.status, severity: diagnostic.severity })
      diagnosticRelationFindings.set(relationId, findings)
    }
  }
  const containsRelations = data.relations.filter((relation) => relation.kind === 'contains')
  const collectScope = (roots: readonly string[]): Set<string> => {
    const ids = new Set(roots)
    let changed = true
    while (changed) {
      changed = false
      for (const relation of containsRelations) {
        if (ids.has(relation.from) && !ids.has(relation.to)) {
          ids.add(relation.to)
          changed = true
        }
      }
    }
    return ids
  }
  const scopedPayload = (ids: ReadonlySet<string>) => ({
    entities: data.entities.filter((entity) => ids.has(entity.id)),
    relations: data.relations.filter((relation) => ids.has(relation.from) && ids.has(relation.to)),
  })
  const packagePayload = (ids: ReadonlySet<string>) => ({
    entities: data.entities.filter((entity) => ids.has(entity.id) && entity.kind === 'package'),
    relations: data.relations.filter((relation) => ids.has(relation.from) && ids.has(relation.to) && entitiesById.get(relation.from)?.kind === 'package' && entitiesById.get(relation.to)?.kind === 'package'),
  })
  const compactPayload = (payload: ReturnType<typeof scopedPayload>) => ({
    entities: payload.entities.map(({ evidence: _evidence, anchor: _anchor, provenance: _provenance, ...entity }) => entity),
    relations: payload.relations.map(({ evidence: _evidence, provenance: _provenance, ...relation }) => relation),
  })
  const levelFiles: Record<string, string> = {}
  const detailFiles: Record<string, string> = {}
  for (const [groupId, group] of Object.entries(data.view.groups)) {
    const ids = new Set(group.members.filter((id) => entitiesById.get(id)?.kind === 'package'))
    const chunkName = data.view.levelChunks.groups[groupId]
    if (chunkName) levelFiles[chunkName] = levelChunkScript(packagePayload(ids))
  }
  const packageIdList = packageEntities.map((entity) => entity.id)
  const packageIdSet = new Set(packageIdList)
  levelFiles[data.view.levelChunks.default] = levelChunkScript(scopedPayload(packageIdSet))
  const sortedPackageIds = [...packageIds].sort()
  for (const [index, packageId] of sortedPackageIds.entries()) {
    const chunkName = data.view.levelChunks.packages[index]
    const packageScope = scopedPayload(collectScope([packageId]))
    if (chunkName) levelFiles[chunkName] = levelChunkScript(compactPayload(packageScope))
    const detailName = chunkName?.replace('chunks/levels-package-', 'chunks/details-')
    if (detailName) detailFiles[detailName] = detailChunkScript(packageScope)
  }

  const overviewView = {
    ...data.view,
    entityGroup: Object.fromEntries(Object.entries(data.view.entityGroup).filter(([id]) => data.entities.find((entity) => entity.id === id)?.kind === 'package')),
    diagnosticGroup,
    diagnosticRelationFindings: Object.fromEntries(diagnosticRelationFindings),
  }
  const files = {
    'chunks/overview.js': chunkScript({ project: data.project, revision: data.revision, revisionKind: data.revisionKind, snapshotHash: data.snapshotHash, reportHash: data.reportHash, configurationHash: data.configurationHash, pipelineVersion: data.pipelineVersion, analyzerVersions: data.analyzerVersions, coverage: data.coverage, diagnosticCount: data.diagnosticCount, diagnosticSummary: data.diagnosticSummary, requiredRelationKinds: data.requiredRelationKinds, entities: packageEntities, relations: packageRelations, view: overviewView }),
    ...levelFiles,
    ...detailFiles,
    'chunks/findings.js': chunkScript({ diagnostics: data.diagnostics }),
  }
  const indexHtml = render(parsed, { ...options, dataExpression: 'globalThis.__DOC_BRIDGE_DATA__', dataScripts: `<script>globalThis.__DOC_BRIDGE_HAS_LEVEL_CHUNKS__=true;globalThis.__DOC_BRIDGE_LAZY_CHUNKS__=["chunks/findings.js"]</script><script src="chunks/overview.js"></script>` })
  const fileHashes = Object.fromEntries(Object.entries({ ...files, 'index.html': indexHtml }).map(([file, content]) => [file, sha256NormalizedV1(content)]))
  const manifestPayload = { schemaVersion: 1, mode: 'directory', generatedBy: '@agentskit/doc-bridge', snapshotHash: parsed.snapshot.contentHash, reportHash: parsed.report.contentHash, configurationHash: parsed.snapshot.configurationHash, sourceRevision: options.privacy === 'anonymized' ? 'redacted' : parsed.snapshot.sourceRevision, renderOptions, files: fileHashes }
  const manifest = JSON.stringify({ ...manifestPayload, artifactHash: sha256NormalizedV1(manifestPayload) }, null, 2)
  return { mode: 'directory', indexHtml, files: { ...files, 'index.html': indexHtml }, manifest }
}
