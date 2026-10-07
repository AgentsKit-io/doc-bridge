import { applyConfigDefaults } from '../config/defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from '../config/schema.js'
import { bindServiceConfig } from './profile.js'

// ADR 0012: containers grant no future leaves.
export const SERVICE_CONFIG_LEAVES = Object.freeze([
  'schemaVersion', 'corpus.agent.root', 'corpus.agent.index', 'corpus.agent.include[]', 'corpus.agent.exclude[]', 'corpus.agent.okf.requireType', 'corpus.agent.okf.allowedTypes[]',
  ...['criticalPaths[]', 'generatedPaths[]', 'exclude[]', 'minWords', 'requiredSections[]', 'requireExamples', 'exactDuplicates', 'defaultTier', 'tierRules[].pattern', 'tierRules[].tier', 'tierRules[].critical', 'requiredCriticalMetadata[]'].map(key => `audit.documentation.${key}`),
  ...['scope', 'requiredRelationKinds[]', 'requiredRelationTargets', 'includeOrphanedDocuments'].map(key => `reconciliation.${key}`),
  ...['depth', 'roots[]', 'exclude[]'].map(key => `analysis.areas.${key}`),
  ...['exclude[]', 'maxFiles', 'maxBytes', 'maxTimeMs', 'maxMemoryMb', 'redactSecrets'].map(key => `safety.${key}`),
])
const cache = new WeakMap<object, { config: DocBridgeConfigV1; diagnostics: readonly string[] }>()
const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
export const serviceConfig = (input: unknown): { config: DocBridgeConfigV1; diagnostics: readonly string[] } => {
  if (input && typeof input === 'object' && cache.has(input)) return cache.get(input)!
  const ignored: string[] = []
  const ignore = (value: unknown, path: string): void => {
    if (ignored.length >= 128) throw new Error('Service configuration exceeds the 128 ignored-key diagnostic budget')
    ignored.push(path.slice(0, 512))
    if (Array.isArray(value)) value.forEach((item, index) => ignore(item, `${path}[${index}]`))
    else if (value && typeof value === 'object') Object.keys(value).sort().forEach(key => ignore((value as Record<string, unknown>)[key], `${path}.${key}`))
  }
  const visit = (value: unknown, path: string): unknown => {
    if (SERVICE_CONFIG_LEAVES.includes(path)) return value
    const arrayLeaf = `${path}[]`
    if (SERVICE_CONFIG_LEAVES.includes(arrayLeaf)) return value
    const container = SERVICE_CONFIG_LEAVES.some(leaf => leaf.startsWith(`${path}.`) || leaf.startsWith(`${path}[].`)) || path === ''
    if (!container) { ignore(value, path); return undefined }
    if (Array.isArray(value)) return value.map(item => visit(item, arrayLeaf))
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().flatMap(key => {
      const child = visit((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
      return child === undefined ? [] : [[key, child]]
    }))
  }
  const parsed = DocBridgeConfigV1Schema.safeParse(visit(input, ''))
  if (!parsed.success) throw new Error('Invalid permitted service configuration: ' + parsed.error.issues.map(issue => issue.path.join('.')).join(', '))
  const paths = [parsed.data.corpus.agent.root, parsed.data.corpus.agent.index, ...(parsed.data.corpus.agent.include ?? []), ...(parsed.data.corpus.agent.exclude ?? []), ...(parsed.data.analysis?.areas?.roots ?? []), ...(parsed.data.analysis?.areas?.exclude ?? []), ...(parsed.data.safety?.exclude ?? []), ...(parsed.data.audit?.documentation?.criticalPaths ?? []), ...(parsed.data.audit?.documentation?.generatedPaths ?? []), ...(parsed.data.audit?.documentation?.exclude ?? []), ...(parsed.data.audit?.documentation?.tierRules ?? []).map(rule => rule.pattern)]
  if (paths.some(path => path && (path.startsWith('/') || path.includes('\\') || path.includes(':') || path.split('/').includes('..')))) throw new Error('Service configuration path escapes caller read roots')
  const config = applyConfigDefaults(parsed.data)
  if (config.safety?.redactSecrets === false) ignored.push('safety.redactSecrets')
  config.safety = { ...config.safety, redactSecrets: true }
  config.index = { ...config.index, llmsTxt: { enabled: false }, capabilities: { enabled: false } }
  config.intelligence = { enabled: false, registry: { enabled: false } }
  config.federation = { enabled: false }
  freeze(config)
  const result = { config: bindServiceConfig(config), diagnostics: Object.freeze(ignored) }
  cache.set(config, result)
  return result
}
