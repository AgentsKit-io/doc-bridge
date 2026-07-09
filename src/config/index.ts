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
  type DocBridgeConfigV1,
  type AgentCorpusConfig,
} from './schema.js'