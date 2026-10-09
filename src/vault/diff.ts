import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import { discoverRepository } from '../discovery/repository.js'
import { denyServiceOperation } from '../execution/profile.js'
import { enrichmentApprovalId } from '../enrich/approvals.js'
import { enrichmentOverlayPath, readEnrichmentOverlay, sealEnrichmentOverlay, writeEnrichmentOverlay } from '../enrich/overlay.js'
import { entityContentHash, validateEnrichmentProposal } from '../enrich/validate.js'
import { EnrichmentProposalV1Schema, enrichmentProposalId, type EnrichmentProposalOf } from '../schemas/enrichment.js'
import { containsSecret } from '../safety/repository.js'
import { toPosix } from '../lib/paths.js'
import { hash, MANIFEST, ManifestSchema, renderVault, requireIgnored, safePath } from './export.js'

/** Review generated-note edits only; the regenerated baseline authenticates source bindings. */
export const diffVault = async (rootPath: string, config: DocBridgeConfigV1) => {
  denyServiceOperation('vault diff', config)
  const root = realpathSync.native(rootPath)
  const output = safePath(root, config.vault?.output ?? '.doc-bridge/vault')
  const human = safePath(root, config.vault?.humanNotes ?? 'docs/notes')
  if (output === root || output === human || output.startsWith(`${human}${sep}`) || human.startsWith(`${output}${sep}`)) throw new Error('Vault output and human-notes folders must be disjoint')
  await requireIgnored(root, output)
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(safePath(root, toPosix(relative(root, resolve(output, MANIFEST)))), 'utf8')))
  const snapshot = discoverRepository({ root, config })
  const baseline = renderVault(root, output, config, snapshot)
  const names = readdirSync(output).filter(name => name.endsWith('.md')).sort()
  const added = names.filter(name => !Object.hasOwn(manifest.files, name))
  const deleted = Object.keys(manifest.files).filter(name => !names.includes(name)).sort()
  const unproposed: { note: string; reason: string }[] = []
  const proposals: EnrichmentProposalOf<'vault-edit'>[] = []
  for (const name of Object.keys(manifest.files).sort()) {
    if (deleted.includes(name)) continue
    const note = toPosix(relative(root, resolve(output, name)))
    const notePath = safePath(root, note)
    if (lstatSync(notePath).size > 262144) { unproposed.push({ note, reason: 'Note exceeds the review budget' }); continue }
    const editedBytes = readFileSync(notePath)
    if (hash(editedBytes) === manifest.files[name]) continue
    const original = baseline[name]
    if (!original || hash(original) !== manifest.files[name]) { unproposed.push({ note, reason: 'Source or export configuration changed; original binding cannot be revalidated' }); continue }
    if (editedBytes.length > 262144 || Buffer.byteLength(original) > 262144 || !Buffer.from(editedBytes.toString('utf8')).equals(editedBytes)) { unproposed.push({ note, reason: 'Note exceeds the review budget or is not UTF-8' }); continue }
    if (containsSecret(original) || containsSecret(editedBytes.toString('utf8'))) { unproposed.push({ note, reason: 'Potential secret detected; redact the note before review' }); continue }
    const metadata: { id: string; sources?: { path: string; regions: { lineStart: number; lineEnd: number; hash: string }[] }[] } = parse(original.split('---\n')[1]!)
    const direct = snapshot.entities.find(entity => entity.id === metadata.id)
    const targets = direct ? [direct] : snapshot.entities.filter(entity => entity.kind === 'document' && metadata.sources?.some((source: { path: string }) => source.path === entity.path))
    const sourceRegions = (metadata.sources ?? []).flatMap((source: { path: string; regions: { lineStart: number; lineEnd: number; hash: string }[] }) => source.regions.map(region => ({ path: source.path, ...region })))
    if (!targets.length || !sourceRegions.length) { unproposed.push({ note, reason: 'No source document region is bound to this navigation note' }); continue }
    for (const entity of targets) {
      const boundRegions = sourceRegions.filter((region: { path: string }) => region.path === entity.path || entity.evidence.some(item => item.path === region.path))
      if (!entity.evidence.length || !boundRegions.length) { unproposed.push({ note, reason: 'No source document region is bound to this target' }); continue }
      const payload = { note, originalHash: manifest.files[name]!, editedHash: hash(editedBytes), original, edited: editedBytes.toString('utf8'), sourceRegions: boundRegions }
      const identity = { kind: 'vault-edit' as const, entity: entity.id, targetContentHash: entityContentHash(entity), origin: { agentId: 'doc-bridge.vault-diff', agentVersion: '1', promptVersion: '1' }, payload }
      const proposal = EnrichmentProposalV1Schema.parse({ ...identity, type: 'enrichment-proposal', schemaVersion: 1, proposalId: enrichmentProposalId(identity), confidence: 1, reason: 'Generated note edited; human review required before any source change', evidence: entity.evidence.slice(0, 32), baseSnapshotHash: snapshot.contentHash }) as EnrichmentProposalOf<'vault-edit'>
      const verdict = validateEnrichmentProposal(proposal, { snapshot })
      if (verdict.status !== 'pending') throw new Error(`Vault proposal validation failed: ${verdict.status}`)
      proposals.push(proposal)
    }
  }
  safePath(root, toPosix(relative(root, enrichmentOverlayPath(root))))
  const existing = readEnrichmentOverlay(root)
  if (existsSync(enrichmentOverlayPath(root)) && !existing) throw new Error('Existing enrichment overlay is invalid; refusing to overwrite it')
  const seen = new Set([...(existing?.pending ?? []).map(entry => entry.proposal.proposalId), ...(existing?.accepted ?? []).map(entry => entry.proposal.proposalId), ...(existing?.rejected ?? []).map(entry => entry.proposalId)])
  const fresh = proposals.filter(proposal => !seen.has(proposal.proposalId))
  if (fresh.length) {
    const stats = existing?.stats ?? { byKind: {}, rejectionReasons: {}, inventedReferences: 0, agentRuns: 0, cacheHits: 0, cacheHitRate: 0, packs: 0, inputBytes: 0, outputBytes: 0, wallTimeMs: 0, expired: 0 }
    const counts = stats.byKind['vault-edit'] ?? { proposed: 0, accepted: 0, pending: 0, rejected: 0 }
    safePath(root, toPosix(relative(root, `${enrichmentOverlayPath(root)}.tmp-${process.pid}`)))
    writeEnrichmentOverlay(root, sealEnrichmentOverlay({ type: 'enrichment-overlay', schemaVersion: 1, contentHashAlgo: 'sha256-normalized-v1', project: snapshot.project, sourceRevision: snapshot.sourceRevision, sourceRevisionKind: snapshot.sourceRevisionKind, configurationHash: snapshot.configurationHash, pipelineVersion: snapshot.pipelineVersion, analyzerVersions: snapshot.analyzerVersions, baseSnapshotHash: snapshot.contentHash, accepted: existing?.accepted ?? [], pending: [...(existing?.pending ?? []), ...fresh.map(proposal => ({ proposal, approvalId: enrichmentApprovalId(proposal.proposalId, proposal.targetContentHash) }))], rejected: existing?.rejected ?? [], stats: { ...stats, byKind: { ...stats.byKind, 'vault-edit': { ...counts, proposed: counts.proposed + fresh.length, pending: counts.pending + fresh.length } } } }))
  }
  return { output: toPosix(relative(root, output)), proposals, added, deleted, unproposed }
}
