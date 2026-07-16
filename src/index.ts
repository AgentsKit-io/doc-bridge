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
  DocumentationStandardRuleIdSchema,
  DocumentationStandardV1ConfigSchema,
  EcosystemContractEvidenceSchema,
  type DocBridgeConfigV1,
  type AgentCorpusConfig,
  type DocumentationStandardV1Config,
} from './config/schema.js'

export {
  AgentHandoffV1Schema,
  AgentHandoffLegacySchema,
  AgentSearchV1Schema,
  HandoffTargetTypeSchema,
  HANDOFF_SCHEMA_VERSION,
  normalizeAgentHandoff,
  HandoffBridgeSchema,
  type AgentHandoffV1,
  type HandoffBridge,
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
  AgentHandoffV1JsonSchema,
  DocBridgeIndexV1JsonSchema,
  DocBridgeJsonSchemas,
  MemoryCandidateV1JsonSchema,
} from './schemas/json-schemas.js'

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
export {
  formatEcosystemLlmsBlock,
  formatEcosystemLlmsSection,
  type EcosystemLlmsProduct,
  type FormatEcosystemLlmsBlockOptions,
} from './federation/ecosystem-llms.js'
export {
  scanHumanDocRecords,
  scanHumanDocs,
  type HumanDocMap,
  type HumanDocRecord,
} from './index-builder/plugins/human-markdown.js'
export {
  resolveGateIds,
  runGate,
  runGates,
  type GateId,
  type GateResult,
  type GateRunResult,
} from './gates/run-gates.js'
export {
  DOCUMENTATION_STANDARD_V1_ID,
  DOCUMENTATION_STANDARD_V1_STATUS,
  formatDocumentationStandardText,
  runDocumentationStandardV1,
  type DocumentationConformanceReportV1,
  type DocumentationStandardEvidence,
  type DocumentationStandardRemediation,
  type DocumentationStandardRuleId,
  type DocumentationStandardRuleLevel,
  type DocumentationStandardRuleResult,
  type DocumentationStandardRuleStatus,
} from './conformance/documentation-standard-v1.js'
export { MCP_TOOLS, handleMcpRequest, startMcpStdioServer } from './mcp/server.js'
export { installMcpConfig, mcpSnippet, type McpInstallResult, type McpInstallTarget } from './mcp/install.js'
export { runDoctor, formatDoctorText, type DoctorReport, type DoctorIssue, type DoctorCoverage } from './doctor/run-doctor.js'
export {
  doctorBadgeMetrics,
  formatDoctorBadgeJson,
  formatDoctorBadgeMarkdown,
  type DoctorBadgeMetrics,
} from './doctor/badge.js'
export { watchDocBridgeIndex, type WatchIndexOptions } from './index-builder/watch-index.js'
export {
  promoteMemoryToGithubPr,
  writePromotionDraft,
  defaultPromotionDraftPath,
  type GithubPrOptions,
  type GithubPrResult,
} from './memory/github-pr.js'
export { sha256NormalizedV1 } from './index-builder/content-hash.js'
export { IndexNotFoundError, indexFilePath, loadDocBridgeIndex, resolveRoot } from './query/load-index.js'
export { runQuery, type QueryKind, type QueryRequest, type QueryResult } from './query/query.js'
export { searchIndex, type SearchMatch } from './query/search.js'
export {
  ingestAgentMemory,
  ingestCursorRules,
  ingestMemoryCandidates,
} from './memory/ingest.js'

export {
  classifyMemoryCandidates,
  draftMemoryPromotion,
  scanMemorySafety,
  type MemoryClassification,
  type MemoryPromotionDraft,
  type MemoryRoute,
  type SafetyFinding,
} from './memory/pipeline.js'

export {
  chunksFromMarkdown,
  loadFederatedChunks,
  parseLlmsTxtLinks,
  retrieveHybridChunks,
  type FederatedRetrieverOptions,
  type FetchText,
} from './federation/llms.js'

export {
  createDocBridgeRetriever,
  retrieveDocBridgeChunks,
  type DocBridgeRetrievedChunk,
  type DocBridgeRetriever,
  type DocBridgeRetrieverOptions,
} from './retriever/doc-bridge-retriever.js'

export { PACKAGE_VERSION } from './version.js'

export { collectPackages, buildLookup } from './index-builder/build-handoffs.js'
export { projectRootFromConfigPath } from './config/load-config.js'
export { createDocBridgeRag } from './intelligence/rag.js'
export { runChatOnce, startInkChat } from './intelligence/chat.js'
export { PeerMissingError, layer1InstallHint } from './intelligence/peers.js'
export {
  DOC_BRIDGE_PATTERN_ID,
  DOC_BRIDGE_PATTERN_META,
  docBridgePatternMarkdown,
  docBridgePatternPayload,
} from './playbook/doc-bridge-pattern.js'
