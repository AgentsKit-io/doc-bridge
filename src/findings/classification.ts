import { frontmatterString } from '../lib/markdown.js'

/** Shared classification, with stable discovery and audit audience projections. */
const inferredDocumentType = (path: string): string => {
  const lower = path.toLocaleLowerCase()
  if (lower === 'agents.md' || lower.endsWith('/agents.md') || lower.includes('/for-agents/')) return 'agent-guidance'
  if (lower.includes('/adr/') || lower.startsWith('adr/')) return 'architecture-decision'
  if (lower.includes('runbook') || lower.includes('/operations/')) return 'runbook'
  if (lower.includes('security')) return 'security'
  if (lower.includes('contribut')) return 'contribution'
  if (lower.includes('architecture')) return 'architecture'
  if (lower.includes('/api/') || lower.includes('/reference/')) return 'reference'
  if (lower.includes('/example') || lower.includes('/recipe')) return 'example'
  return 'guide'
}

const inferredAudience = (path: string): string => {
  const lower = path.toLocaleLowerCase()
  if (lower.includes('/agent-corpus/') || lower.includes('/for-agents/') || lower.endsWith('agents.md')) return 'agent'
  if (lower === 'readme.md' || lower.includes('/readme.')) return 'human-and-agent'
  return 'human'
}

const inferredLifecycle = (path: string): string => /(?:^|\/)(?:archive|archived|historical)(?:\/|$)/i.test(path) ? 'archived' : 'active'


export const classifyDocument = (path: string, frontmatter: Parameters<typeof frontmatterString>[0] = {}) => {
  const discoveryAudience = /(^|\/)docs\/for-agents(?:\/|$)/.test(path) ? 'agent'
    : /(^|\/)docs-archive(?:\/|$)/.test(path) ? 'archive'
    : /(^|\/)docs(?:\/|$)/.test(path) ? 'human'
    : /(^|\/)(README|CONTRIBUTING|SECURITY|CHANGELOG)(?:\.|$)/i.test(path) ? 'project' : 'unclassified'
  return {
    type: frontmatterString(frontmatter, 'type') ?? inferredDocumentType(path),
    audience: frontmatterString(frontmatter, 'audience') ?? inferredAudience(path),
    discoveryAudience,
    lifecycle: frontmatterString(frontmatter, 'lifecycle') ?? inferredLifecycle(path),
  }
}
