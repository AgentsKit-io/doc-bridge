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
  DocumentationAuditConfigSchema,
  DocumentationStandardRuleIdSchema,
  DocumentationStandardV1ConfigSchema,
  EcosystemContractEvidenceSchema,
  type DocBridgeConfigV1,
  type DocumentationAuditConfig,
  type AgentCorpusConfig,
  type DocumentationStandardV1Config,
  RuleIdSchema,
  RuleSeveritySchema,
  RulesConfigSchema,
  WorkflowConfigSchema,
  RepositorySafetyConfigSchema,
  ReportConfigSchema,
  type RuleId,
  type RuleSeverity,
  type RulesConfig,
  type WorkflowConfig,
  type RepositorySafetyConfig,
  type ReportConfig,
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
  parseAgentProposal,
  parseAgentSearch,
  parseDocBridgeConfig,
  parseDocBridgeIndex,
  parseDiscoverySnapshot,
  parseFixProposal,
  parseMemoryCandidate,
  parseReconciliationReport,
  parseWorkflowRun,
  safeParseAgentHandoff,
  type ParseIssue,
  type ParseResult,
} from './validate.js'

export { buildDocBridgeIndex, type BuildIndexOptions, type BuildIndexResult } from './index-builder/build-index.js'
export { discoverRepository, type DiscoveryOptions } from './discovery/repository.js'
export { containedPath, DEFAULT_SAFETY_EXCLUDES, redactSecrets, redactValue, safeWalkFiles, type SafeWalkOptions, type SafeWalkResult } from './safety/repository.js'
export { DEFAULT_REGISTRY_AGENT_ID, createRegistryAgentAdapter, loadRegistryAgentMetadata, loadRegistryAgentRunner, persistRegistryAgentProposal, type RegistryAgentAdapter, type RegistryAgentContext, type RegistryAgentMetadata, type RegistryAgentRunner } from './agents/registry-adapter.js'
export {
  applyDocumentationDeclarations,
  parseDocumentationDeclarations,
  type DocumentationAnalysisResult,
  type DocumentationDeclarationInput,
  type DocumentationDeclarationOptions,
  type DocumentationDeclarationResult,
  type DocumentationDiagnostic,
} from './discovery/documentation.js'
export { reconcileKnowledge } from './reconciliation/reconcile.js'
export {
  DOCUMENTATION_AUDIT_SCHEMA_VERSION,
  DocumentationAuditDocumentSchema,
  DocumentationAuditFindingSchema,
  DocumentationAuditReportV1Schema,
  auditDocumentation,
  formatDocumentationAuditText,
  type DocumentationAuditFinding,
  type DocumentationAuditDocument,
  type DocumentationAuditOptions,
  type DocumentationAuditReportV1,
} from './audit/documentation.js'
export {
  DEFAULT_LARGE_REPORT_THRESHOLD_BYTES,
  renderOfflineReport,
  renderOfflineReportArtifact,
  type OfflineReportArtifact,
  type OfflineReportInput,
  type OfflineReportOptions,
} from './report/html.js'
export {
  applyFixProposal,
  approveFixProposal,
  createArtifactNormalizationProposal,
  createMarkdownLinkFixProposal,
  type FixApplyOptions,
  type FixProposalOptions,
} from './fixes/proposals.js'
export {
  WORKFLOW_STAGES,
  loadWorkflowManifest,
  loadWorkflowStepOutput,
  runWorkflow,
  type WorkflowExecutionResult,
  type WorkflowOptions,
  type WorkflowStage,
  type WorkflowStageContext,
  type WorkflowStageHandler,
} from './workflow/engine.js'
export {
  STUDY_METRICS_SCHEMA_VERSION,
  StudyMetricsReportV1Schema,
  calculateStudyMetrics,
  formatStudyMetricsText,
  parseStudyMetrics,
  type StudyMetricComparisonV1,
  type StudyMetricGroupV1,
  type StudyMetricSetV1,
  type StudyMetricsReportV1,
} from './study/metrics.js'
export {
  ControlledStudyVerifiedResultV1Schema,
  STUDY_VERIFICATION_CONTENT_HASH_ALGO,
  STUDY_VERIFICATION_SCHEMA_VERSION,
  StudyVerificationBindingV1Schema,
  createControlledStudyVerifiedResult,
  createStudyVerificationBinding,
  formatStudyVerificationText,
  parseControlledStudyVerifiedResult,
  parseStudyVerificationBinding,
  scanStudyPublicationArtifact,
  type ControlledStudyVerifiedResultV1,
  type StudyPrivacyScan,
  type StudyVerificationBindingV1,
} from './study/verification.js'
export {
  evaluateRules,
  parseRuleId,
  parseRuleSeverity,
  type RuleEngineOptions,
  type RuleEvaluationResult,
  type RuleFinding,
  type RuleMode,
} from './rules/engine.js'
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
export { MCP_TOOLS, handleMcpRequest, respondMcpRequest, startMcpStdioServer } from './mcp/server.js'
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
export { canonicalJsonV1, contentHashForArtifactV1, sha256NormalizedV1 } from './index-builder/content-hash.js'
export {
  ANALYZER_PLUGIN_CONTRACT_VERSION,
  AnalyzerPluginManifestSchema,
  AnalyzerPluginOutputSchema,
  createAnalyzerRegistry,
  type AnalyzerPlugin,
  type AnalyzerPluginInput,
  type AnalyzerPluginManifest,
  type AnalyzerPluginOutput,
  type AnalyzerRegistry,
} from './plugins/contract.js'
export {
  BENCHMARK_SCHEMA_VERSION,
  BenchmarkFixtureV1Schema,
  benchmarkFixture,
  compareBenchmarkSnapshots,
  formatBenchmarkText,
  measureAgentEfficiency,
  measureBenchmark,
  type AgentEfficiencyObservation,
  type BenchmarkFixtureV1,
  type BenchmarkObservation,
  type BenchmarkResult,
  type BenchmarkSetMetrics,
  type BenchmarkSnapshot,
  type BenchmarkSnapshotDiff,
} from './metrics/benchmark.js'
export {
  STUDY_PROTOCOL_CONTENT_HASH_ALGO,
  STUDY_PROTOCOL_SCHEMA_VERSION,
  StudyProtocolV1Schema,
  HistoricalEvidenceRecordV1Schema,
  HistoricalEvidenceRegistryV1Schema,
  createStudyProtocol,
  parseStudyProtocol,
  createHistoricalEvidenceRegistry,
  parseHistoricalEvidenceRegistry,
  validateHistoricalEvidenceRegistry,
  formatStudyProtocolText,
  formatHistoricalEvidenceText,
  type StudyProtocolV1,
  type HistoricalEvidenceRecordV1,
  type HistoricalEvidenceRegistryV1,
} from './study/protocol.js'
export {
  STUDY_TASK_SUITE_CONTENT_HASH_ALGO,
  STUDY_TASK_SUITE_SCHEMA_VERSION,
  StudyTaskSuiteV1Schema,
  createStudyTaskSuite,
  evaluateStudyTask,
  formatStudyTaskSuiteText,
  parseStudyTaskSuite,
  selectTaskExecutions,
  validateStudyTaskSuite,
  type StudyTaskSuiteV1,
  type StudyTaskV1,
  type TaskEvaluation,
  type TaskEvaluationInput,
  type TaskExecution,
  type TaskOutcomeStatus,
} from './study/task-suite.js'
export {
  STUDY_RUNNER_CONTENT_HASH_ALGO,
  STUDY_RUNNER_SCHEMA_VERSION,
  ControlledStudyObservationLedgerV1Schema,
  ControlledStudyObservationV1Schema,
  ControlledStudyRunPlanV1Schema,
  createControlledStudyLedger,
  createControlledStudyObservation,
  createControlledStudyRunPlan,
  formatControlledStudyRunPlanText,
  parseControlledStudyLedger,
  parseControlledStudyObservation,
  parseControlledStudyRunPlan,
  persistControlledStudyLedger,
  runControlledCommand,
  upsertControlledStudyObservation,
  type ControlledCommandRequest,
  type ControlledStudyObservationLedgerV1,
  type ControlledStudyObservationV1,
  type ControlledStudyRunPlanV1,
  type TaskExecutionV1,
} from './study/runner.js'
export {
  STUDY_PROVIDER_CLI_CONTENT_HASH_ALGO,
  STUDY_PROVIDER_CLI_SCHEMA_VERSION,
  StudyProviderCliConfigV1Schema,
  createStudyProviderCliConfig,
  calculateStudyCostUsd,
  formatStudyProviderCliText,
  parseStudyProviderCliConfig,
  providerForStudyExecution,
  validateStudyProviderCommand,
  type StudyProviderCli,
  type StudyProviderCliConfigV1,
  type StudyProviderCostPricing,
  type StudyAdjudicatorCli,
} from './study/provider-cli.js'
export {
  STUDY_ADJUDICATION_METHOD,
  adjudicatedLedgerInputHash,
  independentlyAdjudicateStudyLedger,
  independentlyAdjudicateStudyObservation,
  persistIndependentlyAdjudicatedLedger,
  type IndependentStudyAdjudicationOptions,
} from './study/adjudication.js'
export {
  STUDY_REPOSITORY_CONFIG_CONTENT_HASH_ALGO,
  STUDY_REPOSITORY_CONFIG_SCHEMA_VERSION,
  StudyRepositoryConfigV1Schema,
  createStudyRepositoryConfig,
  formatControlledStudyRunText,
  adjudicateControlledStudyObservation,
  parseStudyRepositoryConfig,
  runControlledStudy,
  type ControlledStudyRunOptions,
  type ControlledStudyRunSummary,
  type StudyRepositoryConfigV1,
} from './study/execution.js'
export {
  AgentProposalV1Schema,
  AffectedFileSchema,
  CoverageSchema,
  DiagnosticSeveritySchema,
  DiscoverySnapshotV1Schema,
  EntitySchema,
  EvidenceSchema,
  EvidenceSourceSchema,
  FindingStatusSchema,
  FixProposalStatusSchema,
  FixChangeSchema,
  FixProposalV1Schema,
  KNOWLEDGE_CONTENT_HASH_ALGO,
  KNOWLEDGE_SCHEMA_VERSION,
  ProvenanceSchema,
  ProjectIdentitySchema,
  ProposalOriginSchema,
  ReconciliationReportV1Schema,
  RelationSchema,
  WorkflowRunV1Schema,
  WorkflowStepSchema,
  WorkflowStateSchema,
  WorkflowTransitionSchema,
  type AgentProposalV1,
  type DiagnosticSeverity,
  type DiscoverySnapshotV1,
  type Evidence,
  type FindingStatus,
  type FixProposalV1,
  type FixChange,
  type KnowledgeArtifactV1,
  type KnowledgeDiagnostic,
  type KnowledgeEntity,
  type KnowledgeRelation,
  type Provenance,
  type ReconciliationReportV1,
  type WorkflowRunV1,
  type WorkflowState,
} from './schemas/knowledge.js'
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
export { discoverNxProjects } from './index-builder/plugins/nx.js'
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
