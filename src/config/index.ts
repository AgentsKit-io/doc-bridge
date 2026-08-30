export { defineConfig } from './define-config.js'
export { applyConfigDefaults } from './defaults.js'
export {
  loadConfig,
  resolveProjectRoot,
  projectRootFromConfigPath,
  ConfigNotFoundError,
} from './load-config.js'
export {
  DocBridgeConfigV1Schema,
  DocumentationAuditConfigSchema,
  ReconciliationConfigSchema,
  AgentCorpusConfigSchema,
  HumanCorpusConfigSchema,
  DocumentationStandardRuleIdSchema,
  DocumentationStandardV1ConfigSchema,
  EcosystemContractEvidenceSchema,
  ConformanceConfigSchema,
  ReportConfigSchema,
  type DocBridgeConfigV1,
  type DocumentationAuditConfig,
  type AgentCorpusConfig,
  type DocumentationStandardRuleId,
  type DocumentationStandardV1Config,
  type ReconciliationConfig,
  type ReportConfig,
} from './schema.js'
