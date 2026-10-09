import type { DocBridgeConfigV1 } from '../config/schema.js'
import { discoverRepository } from '../discovery/repository.js'
import { diffSnapshots } from '../diff/change-set.js'
import { parseDiscoverySnapshot } from '../validate.js'
import { runGates } from '../gates/run-gates.js'
import { findingSuppressed, replayRemediation } from '../enrich/settled.js'
import { enrichmentOverlayPath, parseEnrichmentOverlay } from '../enrich/overlay.js'
import type { RejectedEnrichment } from '../schemas/enrichment.js'
import { readBoundedText } from '../lib/bounded-text.js'
import { RemediationV1Schema } from '../schemas/findings.js'
import { revalidateRemediation, type RemediationApplyOptions } from './regions.js'

/** CLI/MCP recompute findings; supplied proposal evidence is never its own validator. */
export const remediationWorkflow = (root: string, config: DocBridgeConfigV1, baseInput: unknown, input: unknown, allowedRoots: readonly string[], operation: 'prepare' | 'decision' = 'prepare') => {
  const base = parseDiscoverySnapshot(baseInput)
  const head = discoverRepository({ root, config })
  const findings = diffSnapshots(base, head, { headRoot: root, policy: true }).policy.findings
  let rejected: readonly RejectedEnrichment[] = []
  try {
    const overlay = parseEnrichmentOverlay(JSON.parse(readBoundedText(enrichmentOverlayPath(root), { used: 0 })))
    if (!overlay) throw new Error('Invalid settled overlay: recover decision evidence before remediation')
    rejected = overlay.rejected
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const candidate = replayRemediation(RemediationV1Schema.parse(input), rejected)
  const options: RemediationApplyOptions = {
    currentRevision: head.sourceRevision, configurationHash: head.configurationHash,
    evidenceHash: candidate.evidenceHash, allowedRoots,
    validateEvidence: proposal => findings.some(finding => finding.id === proposal.findingId && finding.evidenceHash === proposal.evidenceHash && ['proposed', 'routed-to-L2'].includes(finding.routing) && !findingSuppressed(finding, rejected)),
    verify: () => { const gates = runGates(root, config); if (!gates.ok) throw new Error(`Post-apply gates failed: ${gates.results.filter(gate => !gate.ok).map(gate => gate.message).join('; ')}`) },
  }
  if (operation === 'decision' && (candidate.configurationHash !== options.configurationHash || !options.validateEvidence(candidate))) throw new Error('Fresh evidence/configuration validation failed')
  return { proposal: operation === 'decision' ? candidate : revalidateRemediation(root, candidate, options), options, findings }
}
