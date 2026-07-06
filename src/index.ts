export { defineConfig } from './config/define-config.js'
export { applyConfigDefaults } from './config/defaults.js'
export {
  loadConfig,
  resolveProjectRoot,
  ConfigNotFoundError,
  type LoadConfigOptions,
  type LoadConfigResult,
} from './config/load-config.js'
export {
  DocBridgeConfigV1Schema,
  type DocBridgeConfigV1,
  type AgentCorpusConfig,
} from './config/schema.js'

export {
  AgentHandoffV1Schema,
  AgentHandoffLegacySchema,
  AgentSearchV1Schema,
  HandoffTargetTypeSchema,
  HANDOFF_SCHEMA_VERSION,
  normalizeAgentHandoff,
  type AgentHandoffV1,
  type AgentSearchV1,
  type HandoffTarget,
  type HandoffTargetType,
} from './schemas/agent-handoff.js'

export {
  DocBridgeIndexV1Schema,
  KnowledgeEntrySchema,
  INDEX_SCHEMA_VERSION,
  type DocBridgeIndexV1,
  type KnowledgeEntry,
} from './schemas/doc-bridge-index.js'

export {
  MemoryCandidateV1Schema,
  MEMORY_CANDIDATE_SCHEMA_VERSION,
  type MemoryCandidateV1,
} from './schemas/memory-candidate.js'

export {
  parseAgentHandoff,
  parseAgentSearch,
  parseDocBridgeConfig,
  parseDocBridgeIndex,
  parseMemoryCandidate,
  safeParseAgentHandoff,
  type ParseIssue,
  type ParseResult,
} from './validate.js'

export { buildDocBridgeIndex, type BuildIndexOptions, type BuildIndexResult } from './index-builder/build-index.js'
export { sha256NormalizedV1 } from './index-builder/content-hash.js'
export { IndexNotFoundError, indexFilePath, loadDocBridgeIndex, resolveRoot } from './query/load-index.js'
export { runQuery, type QueryKind, type QueryRequest, type QueryResult } from './query/query.js'
export { searchIndex, type SearchMatch } from './query/search.js'

export { PACKAGE_VERSION } from './version.js'