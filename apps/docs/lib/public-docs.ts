/**
 * Public product documentation surface for doc-bridge.agentskit.io.
 * Maintainer dogfood / plans stay in the repository but are not compiled into the site tree.
 */
export const PRIVATE_DOC_PREFIXES = [
  'DOGFOOD',
  'DOGFOOD.md',
  'DOGFOOD-V1.md',
  'DOGFOOD-ROUND2.md',
  'DOGFOOD-ROUND3.md',
  'MARKETPLACE-ECOSYSTEM-PLAN.md',
  'agent-corpus',
  'landing',
] as const

export function isPublicDocPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')

  if (normalized.startsWith('DOGFOOD') || normalized.includes('/DOGFOOD')) return false
  if (normalized === 'MARKETPLACE-ECOSYSTEM-PLAN.md') return false
  if (normalized.startsWith('agent-corpus/')) return false
  if (normalized.startsWith('landing/')) return false
  // Public product tree (guides included)
  if (normalized.startsWith('guides/')) return true

  return true
}
