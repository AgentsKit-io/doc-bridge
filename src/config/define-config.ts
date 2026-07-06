import { applyConfigDefaults } from './defaults.js'
import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from './schema.js'

/** Type-safe config helper for `doc-bridge.config.ts`. */
export const defineConfig = (config: DocBridgeConfigV1): DocBridgeConfigV1 =>
  applyConfigDefaults(DocBridgeConfigV1Schema.parse(config))