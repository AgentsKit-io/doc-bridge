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
  AgentQueryModeSchema,
  HandoffTargetTypeSchema,
  HANDOFF_SCHEMA_VERSION,
  normalizeAgentHandoff,
  HandoffBridgeSchema,
  type AgentHandoffV1,
  type HandoffBridge,
  type AgentSearchV1,
  type AgentQueryMode,
  type HandoffTarget,
  type HandoffTargetType,
} from './schemas/agent-handoff.js'

export {
  DocBridgeIndexV1Schema,
  KnowledgeEntrySchema,
  RepositoryInputsSchema,
  RetrievalMetadataSchema,
  INDEX_SCHEMA_VERSION,
  type DocBridgeIndexV1,
  type KnowledgeEntry,
  type RepositoryInputs,
  type RetrievalMetadata,
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
export {
  CORPUS_PROJECTION_VERSION,
  PROJECTED_ENTRY_TYPES,
  indexConfigurationHash,
  isProjectedEntry,
  repositoryInputs,
  type RepositoryInputsV1,
} from './index-builder/project-corpus.js'
export {
  checkIndexReproducibility,
  type IgnoredIndexEntry,
  type IndexReproducibility,
} from './discovery/reproducibility.js'
export {
  DOCUMENT_BODY_LIMIT,
  EMPTY_OVERLAY_HASH,
  RETRIEVAL_PROJECTION_VERSION,
  projectRetrievalIndex,
  relationConfidence,
  snapshotObservationHash,
  toKnowledgeEntry,
  weakerConfidence,
  type CuratedDocument,
  type ProjectRetrievalOptions,
  type RetrievalOverlayInput,
  type RetrievalRoutes,
} from './retrieval/project.js'
export {
  ACCEPTED_SIGNALS_WEIGHT,
  RELEVANCE_FLOOR,
  rankRetrieval,
  type RankExplanation,
  type RankOptions,
  type RankedEntry,
  type ScoreComponents,
} from './retrieval/rank.js'
export {
  RETRIEVAL_INDEX_SCHEMA_VERSION,
  RetrievalEntrySchema,
  RetrievalIndexV1Schema,
  RetrievalKindSchema,
  ConfidenceSchema,
  AudienceSchema,
  type Audience,
  type Confidence,
  type RetrievalEdge,
  type RetrievalEntry,
  type RetrievalFields,
  type RetrievalGraph,
  type RetrievalIndexV1,
  type RetrievalKind,
} from './schemas/retrieval-index.js'
export { entityId, relationId } from './discovery/identity.js'
export {
  DEFAULT_COMMUNITY_SEED,
  DEFAULT_PROXIMITY_DEPTH,
  DOCUMENTATION_EDGE_KINDS,
  GRAPH_ANALYZER_VERSION,
  IMPORT_EDGE_KINDS,
  MAX_REPORTED_CYCLES,
  PROXIMITY_EDGE_KINDS,
  areaSuggestionCoverage,
  areaSuggestions,
  buildKnowledgeGraph,
  canonicality,
  centrality,
  importCycles,
  proximity,
  seededRandom,
  type AreaSuggestion,
  type BuildGraphOptions,
  type GraphSignal,
  type ImportCycle,
  type ProximityOptions,
} from './graph/build.js'
export {
  createDocBridgeGraphMemory,
  type GraphEdge,
  type GraphMemory,
  type GraphNode,
  type GraphQuery,
  type KnowledgeOverlay,
} from './graph/memory.js'
export {
  AREA_ANALYZER_VERSION,
  DEFAULT_AREA_DEPTH,
  DEFAULT_AREA_ROOTS,
  conventionalAreaPath,
  deriveAreas,
  unobservedOwnershipPaths,
  type AreaModule,
  type AreaOwnership,
  type DeriveAreasOptions,
  type DerivedArea,
} from './discovery/areas.js'
export {
  MARKDOWN_ANALYZER_VERSION,
  MARKDOWN_RELATION_CAP,
  analyzeMarkdownDocument,
  declaredAudience,
  markdownContentHash,
  parseMarkdownDocument,
  type MarkdownAnalysis,
  type MarkdownDocumentV1,
  type MarkdownFrontmatter,
  type MarkdownGeneratedRegion,
  type MarkdownHeading,
  type MarkdownNote,
  type MarkdownReference,
  type MarkdownResolution,
} from './discovery/markdown.js'
export {
  FUZZY_RESOLUTION_THRESHOLD,
  fuzzyMatchList,
  jaro,
  jaroWinkler,
  resolveFuzzyReference,
  type FuzzyMatch,
} from './lib/fuzzy-match.js'
export {
  CONFIG_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  SOURCE_EXTENSIONS,
  documentClassification,
  exportedNames,
  safeWalkOptions,
} from './discovery/inputs.js'
export {
  BM25_VERSION,
  bm25Idf,
  bm25Search,
  buildBm25Index,
  type Bm25FieldWeights,
  type Bm25Hit,
  type Bm25Index,
  type Bm25Input,
  type Bm25Params,
} from './retrieval/bm25.js'
export {
  DEFAULT_SEARCH_PARAMS,
  DEFAULT_SEARCH_WEIGHTS,
  resolveSearchParams,
  resolveSearchWeights,
} from './retrieval/weights.js'
export {
  SEARCH_LEXICON_VERSION,
  SEARCH_STOPWORDS,
  expandSearchToken,
  foldAccents,
  hasSearchToken,
  isSearchStopword,
  searchTokens,
  singularizeSearchToken,
  tokenizeSearchText,
  type SearchTokenizeOptions,
} from './query/text.js'
export { discoverRepository, type DiscoveryOptions } from './discovery/repository.js'
export {
  FILE_BACKED_KINDS,
  declaredExportsOf,
  exportsOf,
  fileContentHash,
  indexPriorSnapshot,
  moduleUniverseFingerprint,
  replayableRelations,
  resolutionFingerprint,
  reuseCoverage,
  type PriorFile,
  type PriorSnapshot,
  type ReuseLedger,
} from './discovery/incremental.js'
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
export { evaluateQualityScorecard, type QualityScorecard, type QualityScorecardInput, type ScorecardCriterion, type ScorecardDimension, type ScorecardStatus } from './study/quality-scorecard.js'
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
  measureAgentTaskEfficiency,
  measureBenchmark,
  type AgentEfficiencyObservation,
  type AgentTaskEfficiencyObservation,
  type BenchmarkFixtureV1,
  type BenchmarkObservation,
  type BenchmarkResult,
  type BenchmarkSetMetrics,
  type BenchmarkSnapshot,
  type BenchmarkSnapshotDiff,
} from './metrics/benchmark.js'
export {
  EVAL_FORMAT_VERSION,
  RETRIEVAL_BENCH_SCHEMA_VERSION,
  RetrievalBenchResultV1Schema,
  RetrievalSuiteCaseSchema,
  RetrievalSuiteSchema,
  formatRetrievalBenchText,
  matchesRetrievalExpectation,
  parseRetrievalBenchResult,
  parseRetrievalSuite,
  rankedOutput,
  runRetrievalBench,
  type RetrievalBenchResultV1,
  type RetrievalCaseOutcome,
  type RetrievalMetrics,
  type RetrievalSuite,
  type RetrievalSuiteCase,
  type RunRetrievalBenchOptions,
} from './bench/retrieval.js'
export {
  RetrievalBaselineV1Schema,
  compareRetrievalBaseline,
  createRetrievalBaseline,
  formatRetrievalComparisonText,
  parseRetrievalBaseline,
  type CompareRetrievalBaselineOptions,
  type CreateRetrievalBaselineOptions,
  type RetrievalBaselineV1,
  type RetrievalComparison,
  type RetrievalComparisonStatus,
  type RetrievalMetricDelta,
} from './bench/baseline.js'
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
export { measureProviderToolTelemetry, type ProviderToolTelemetry } from './study/provider-telemetry.js'
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
  CorrelationContextV1Schema,
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
  type CorrelationContextV1,
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
export { IndexNotFoundError, IndexStaleError, indexFilePath, loadDocBridgeIndex, loadFreshDocBridgeIndex, resolveRoot } from './query/load-index.js'
export { runQuery, type QueryKind, type QueryRequest, type QueryResult } from './query/query.js'
export { searchIndex, type SearchMatch, type SearchOptions } from './query/search.js'
export { handoffForEntity, resolveHandoffEntry, type HandoffOptions } from './query/handoff.js'
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
  retrieveDocBridgeDocuments,
  type DocBridgeRetrievedChunk,
  type DocBridgeRetriever,
  type DocBridgeRetrieverOptions,
  type RetrievedDocument,
  type Retriever,
  type RetrieverRequest,
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

// KR-08: MCP knowledge tools, findings reporter, measured doctor
export {
  approximateCounter,
  compileBudget,
  TOKEN_METHOD,
  type BudgetMessage,
  type BudgetTokenCounter,
  type CompileBudgetInput,
  type CompileBudgetResult,
} from './budget/compile.js'
export { applyBudget, type BudgetedSection } from './budget/sections.js'
export { BUDGET_SECTION_ORDER, BudgetReportSchema, BudgetSectionSchema, type BudgetReport, type BudgetSection } from './schemas/budget.js'
export {
  budgetedHandoff,
  formatKnowledgeLookupText,
  formatKnowledgeSearchText,
  knowledgeLookup,
  knowledgeSearch,
  KNOWLEDGE_TOOLS_SCHEMA_VERSION,
  MAX_LOOKUP_DEPTH,
  resolveLookupEntry,
  type KnowledgeDocumentRef,
  type KnowledgeLookupEntity,
  type KnowledgeEvidence,
  type KnowledgeLookupOptions,
  type KnowledgeLookupRequest,
  type KnowledgeLookupResponse,
  type KnowledgeNeighbour,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
  type KnowledgeSearchResult,
} from './mcp/knowledge.js'
export { findingFromDiagnostic, findingsFromDiagnostics, SEVERITY_ORDER, type Finding, type ReportableDiagnostic, type Severity } from './findings/report.js'
export { formatRetrievedDocuments } from './retriever/doc-bridge-retriever.js'
// KR-09: Markdown renderings
export {
  compileTemplate,
  renderCompiledTemplate,
  renderTemplate,
  renderTemplateWithKnap,
  TemplateError,
  type CompiledTemplate,
  type TemplateVariables,
} from './render/engine.js'
export {
  GENERATED_REGION_CLOSE,
  generatedRegionHash,
  generatedRegionOpen,
  verifyGeneratedRegions,
  wrapGeneratedRegion,
  type GeneratedRegionMismatch,
  type GeneratedRegionRef,
} from './render/generated.js'
export {
  BUNDLED_TEMPLATES,
  RENDER_TEMPLATES,
  RENDER_TEMPLATE_NAMES,
  isRenderTemplateName,
  type RenderTemplateInfo,
  type RenderTemplateName,
} from './render/templates.js'
export { renderNamedTemplate, resolveTemplateSource, type TemplateSource } from './render/template-source.js'
export {
  areaPagesView,
  changeDigestView,
  overlayReviewView,
  ownershipPagesView,
  pageFileName,
  type AreaPageView,
  type ChangeDigestView,
  type OverlayReviewInput,
  type OverlayReviewView,
  type OwnershipPageView,
  type RenderedPage,
  type SnapshotForDigest,
} from './render/data.js'
export {
  applyGeneratedRegions,
  renderArtifact,
  writeRenderedPages,
  type RenderArtifactOptions,
  type RenderArtifactResult,
} from './render/render.js'
export { llmsTxtVariables, type LlmsTxtEntry, type LlmsTxtVariables } from './index-builder/llms-txt.js'
// KR-10: enrichment overlay
export {
  ALIAS_MAX,
  ENRICHMENT_KINDS,
  ENRICHMENT_POLICY,
  ENRICHMENT_REJECTION_REASONS,
  ENRICHMENT_SCHEMA_VERSION,
  INTENT_MAX,
  PROPOSABLE_RELATION_KINDS,
  SUMMARY_MAX,
  AcceptedEnrichmentSchema,
  EnrichmentAdjudicationV1Schema,
  EnrichmentOriginSchema,
  EnrichmentOverlayV1Schema,
  EnrichmentProposalV1Schema,
  PendingEnrichmentSchema,
  RejectedEnrichmentSchema,
  enrichmentAdjudicationId,
  enrichmentOverlayContentHash,
  enrichmentProposalId,
  enrichmentProposalKey,
  isEnrichmentKind,
  type AcceptedEnrichment,
  type EnrichmentAdjudicationV1,
  type EnrichmentKind,
  type EnrichmentOrigin,
  type EnrichmentOverlayV1,
  type EnrichmentPayloads,
  type EnrichmentPolicy,
  type EnrichmentProposalOf,
  type EnrichmentProposalV1,
  type EnrichmentRejectionReason,
  type EnrichmentStats,
  type PendingEnrichment,
  type RejectedEnrichment,
} from './schemas/enrichment.js'
export {
  ALIAS_COLLISION_THRESHOLD,
  applyEnrichmentAdjudication,
  entityContentHash,
  partitionEnrichmentProposals,
  revalidateEnrichmentOverlay,
  validateEnrichmentAdjudication,
  validateEnrichmentProposal,
  type EnrichmentPartition,
  type EnrichmentValidationContext,
  type EnrichmentVerdict,
} from './enrich/validate.js'
export {
  ENRICHMENT_DIR,
  ENRICHMENT_OVERLAY_FILE,
  assertObservedSurvive,
  effectiveEnrichment,
  enrichmentFindings,
  enrichmentOverlayHash,
  enrichmentOverlayPath,
  parseEnrichmentOverlay,
  projectEnrichmentOverlay,
  readEnrichmentOverlay,
  sealEnrichmentOverlay,
  withAcceptedRelations,
  writeEnrichmentOverlay,
  type EffectiveOverlay,
} from './enrich/overlay.js'
export {
  CONTEXT_PACK_VERSION,
  DEFAULT_PACK_BYTES,
  MAX_PACK_NEIGHBOURS,
  batchContextPacks,
  buildContextPacks,
  contextPackHash,
  fitContextPack,
  packByteBudget,
  type BuildContextPacksOptions,
  type ContextPack,
  type EnrichmentTask,
} from './enrich/context-pack.js'
export { createEnrichmentCache, createMemoryEnrichmentCache, enrichmentCacheKey, type EnrichmentCache, type EnrichmentCacheKeyInput } from './enrich/cache.js'
export {
  APPROVALS_DIR,
  ENRICHMENT_APPROVAL_GATE,
  FIX_APPROVAL_GATE,
  approvalsDir,
  createApprovalGateMirror,
  createFileApprovalStore,
  enrichmentApprovalId,
  fixApprovalId,
  listApprovals,
  loadApprovalGate,
  recordApproval,
  type Approval,
  type ApprovalDecision,
  type ApprovalGate,
  type ApprovalStore,
} from './enrich/approvals.js'
export {
  ROLE_TARGET_KINDS,
  ROLE_TASK,
  formatEnrichmentText,
  resolveEnrichmentRoles,
  runEnrichment,
  type EnrichmentAgent,
  type EnrichmentRole,
  type EnrichmentRunOptions,
  type EnrichmentRunResult,
  type ResolvedRole,
} from './enrich/stage.js'
export { decideEnrichment, listEnrichment, type DecideEnrichmentOptions, type DecideEnrichmentResult, type EnrichmentReview } from './enrich/review.js'
export { REGISTRY_AGENT_PROTOCOL_V2, type RegistryEnrichmentContext } from './agents/registry-adapter.js'
export { ACCEPTED_SIGNALS_SHARE } from './retrieval/rank.js'

// KR-11: overlay statistics, the assisted study arm, tokens to first evidence
export {
  INVENTED_RELATION_REASONS,
} from './schemas/enrichment.js'
export {
  cacheHitRate,
  enrichmentCost,
  enrichmentStability,
  formatEnrichmentStatsText,
  inventedReferenceCount,
  overlayProposalIds,
  type EnrichmentStability,
} from './enrich/stats.js'
export {
  OVERLAY_BLOCKING_METRIC,
  OVERLAY_DELTA_METRICS,
  formatOverlayRetrievalDeltaText,
  measureOverlayRetrievalDelta,
  type MeasureOverlayRetrievalDeltaOptions,
  type OverlayMetricDelta,
  type OverlayRetrievalDelta,
} from './bench/overlay-delta.js'
export {
  RUBRIC_MECHANICAL_CHECKS,
  hasRetrievalExpectations,
  mechanicalRubricItems,
  modelRubricItems,
  rubricItemCheck,
  rubricItemText,
  taskRetrievalQueries,
  type RubricItem,
  type RubricMechanicalCheck,
  type ValidateStudyTaskSuiteOptions,
} from './study/task-suite.js'
export {
  STUDY_EXPECTATIONS_SCHEMA_VERSION,
  StudyExpectationsV1Schema,
  checkStudyExpectations,
  createStudyExpectations,
  formatStudyExpectationsText,
  parseStudyExpectations,
  studyRetrievalSuite,
  type CheckStudyExpectationsOptions,
  type StudyExpectationCheck,
  type StudyExpectationOutcome,
  type StudyExpectationsV1,
  type StudyRetrievalSuite,
  type UnresolvedExpectation,
} from './study/expectations.js'
export { ASSISTED_SCENARIO, assistedArmReadiness, type AssistedArmStatus } from './study/execution.js'
export { adjudicatorRubric } from './study/adjudication.js'

// #158: the public documentation parity report — claims, resolvers and the gate over them
export {
  CLAIM_TRANSFORMS,
  CLAIM_VALUE_TYPES,
  PUBLIC_CLAIMS_CONTENT_HASH_ALGO,
  PUBLIC_CLAIMS_SCHEMA_VERSION,
  PublicClaimsV1Schema,
  claimPattern,
  claimSurfaces,
  createPublicClaims,
  exceptionFor,
  parsePublicClaims,
  renderClaim,
  templateFor,
  type ClaimEvidence,
  type ClaimTransform,
  type ClaimValueType,
  type PublicClaim,
  type PublicClaimException,
  type PublicClaimsV1,
} from './parity/claims.js'
export { resolveClaim, type ResolveContext, type ResolvedClaim } from './parity/resolve.js'
export {
  PARITY_CODES,
  PARITY_EXCERPT_LIMIT,
  PUBLIC_PARITY_SCHEMA_VERSION,
  PublicParityReportV1Schema,
  checkPublicParity,
  formatPublicParityText,
  parsePublicParityReport,
  type CheckParityOptions,
  type ParityCode,
  type ParityFinding,
  type PublicParityReportV1,
} from './parity/check.js'
