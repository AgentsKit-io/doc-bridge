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
  AgentCorpusConfigSchema,
  HumanCorpusConfigSchema,
  DocumentationStandardRuleIdSchema,
  DocumentationStandardV1ConfigSchema,
  ConformanceConfigSchema,
  type DocBridgeConfigV1,
  type AgentCorpusConfig,
  type DocumentationStandardRuleId,
  type DocumentationStandardV1Config,
} from './schema.js'
