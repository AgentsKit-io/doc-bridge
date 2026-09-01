import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod'

import { contentHashForArtifactV1, sha256NormalizedV1 } from '../index-builder/content-hash.js'

export const STUDY_PROVIDER_CLI_SCHEMA_VERSION = 1 as const
export const STUDY_PROVIDER_CLI_CONTENT_HASH_ALGO = 'sha256-normalized-v1' as const

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)
const reference = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/)
const command = z.string().min(1).max(512).refine((value) => !/[\u0000\r\n]/.test(value), 'Command cannot contain control characters.')
const argument = z.string().max(2_048).refine((value) => !/[\u0000\r\n]/.test(value), 'Arguments cannot contain control characters.')
const environmentName = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/)
const pricing = z.object({
  currency: z.literal('USD'),
  inputPerMillionUsd: z.number().finite().nonnegative(),
  cachedInputPerMillionUsd: z.number().finite().nonnegative(),
  outputPerMillionUsd: z.number().finite().nonnegative(),
}).strict()

const commandConfig = z.object({
  command,
  args: z.array(argument).max(64).default([]),
  envAllowlist: z.array(environmentName).max(64).default([]),
  providerNetwork: z.boolean(),
  maxInputBytes: z.number().int().positive().max(8_000_000),
  maxOutputBytes: z.number().int().positive().max(256_000),
  pricing: pricing.optional(),
}).strict()

const adjudicatorConfig = z.object({
  id: identifier,
  modelId: identifier,
  ...commandConfig.shape,
}).strict()

const ProviderCliPayloadSchema = z.object({
  type: z.literal('study-provider-cli-config'),
  schemaVersion: z.literal(STUDY_PROVIDER_CLI_SCHEMA_VERSION),
  configVersion: reference,
  providers: z.array(z.object({
    modelId: identifier,
    scenarioIds: z.array(z.enum(['repository-only', 'deterministic-doc-bridge', 'registry-assisted'])).min(1).max(3),
    ...commandConfig.shape,
  }).strict()).min(1).max(16),
  adjudicator: adjudicatorConfig.optional(),
}).strict()

export const StudyProviderCliConfigV1Schema = ProviderCliPayloadSchema.extend({
  contentHash: hash,
  contentHashAlgo: z.literal(STUDY_PROVIDER_CLI_CONTENT_HASH_ALGO),
}).strict()

export type StudyProviderCliConfigV1 = z.infer<typeof StudyProviderCliConfigV1Schema>
export type StudyProviderCli = StudyProviderCliConfigV1['providers'][number]
export type StudyProviderCostPricing = z.infer<typeof pricing>
export type StudyAdjudicatorCli = z.infer<typeof adjudicatorConfig>

export const createStudyProviderCliConfig = (input: unknown): StudyProviderCliConfigV1 => {
  const payload = ProviderCliPayloadSchema.parse(input)
  const hashable = { ...payload, contentHashAlgo: STUDY_PROVIDER_CLI_CONTENT_HASH_ALGO }
  return StudyProviderCliConfigV1Schema.parse({ ...hashable, contentHash: sha256NormalizedV1(hashable) })
}

export const parseStudyProviderCliConfig = (input: unknown): StudyProviderCliConfigV1 => {
  const config = StudyProviderCliConfigV1Schema.parse(input)
  if (contentHashForArtifactV1(config) !== config.contentHash) throw new Error('Invalid study provider CLI config content hash.')
  const duplicateKeys = new Set<string>()
  for (const provider of config.providers) {
    for (const scenarioId of provider.scenarioIds) {
      const key = `${provider.modelId}:${scenarioId}`
      if (duplicateKeys.has(key)) throw new Error(`Duplicate study provider mapping for ${key}.`)
      duplicateKeys.add(key)
    }
  }
  return config
}

export const providerForStudyExecution = (
  config: StudyProviderCliConfigV1,
  modelId: string,
  scenarioId: StudyProviderCli['scenarioIds'][number],
): StudyProviderCli => {
  const provider = config.providers.find((item) => item.modelId === modelId && item.scenarioIds.includes(scenarioId))
  if (!provider) throw new Error(`No provider CLI is configured for model ${modelId} and scenario ${scenarioId}.`)
  return provider
}

export const calculateStudyCostUsd = (pricing: StudyProviderCostPricing | undefined, usage: { readonly inputTokens?: number; readonly cachedInputTokens?: number; readonly outputTokens?: number }): number | undefined => {
  if (!pricing || usage.inputTokens === undefined || usage.outputTokens === undefined) return undefined
  const cachedInputTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens)
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens
  return Number(((uncachedInputTokens * pricing.inputPerMillionUsd + cachedInputTokens * pricing.cachedInputPerMillionUsd + usage.outputTokens * pricing.outputPerMillionUsd) / 1_000_000).toFixed(8))
}

export const validateStudyProviderCommand = (provider: Pick<StudyProviderCli, 'command'>, cwd: string): void => {
  if (isAbsolute(provider.command) || provider.command.includes('/')) {
    const resolvedPath = isAbsolute(provider.command) ? provider.command : resolve(cwd, provider.command)
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) throw new Error(`Provider CLI command is not executable at ${resolvedPath}.`)
    try { accessSync(resolvedPath, constants.X_OK) } catch { throw new Error(`Provider CLI command is not executable at ${resolvedPath}.`) }
    return
  }
  const pathEntries = (process.env.PATH ?? '').split(':').filter(Boolean)
  if (pathEntries.some((entry) => { try { accessSync(resolve(entry, provider.command), constants.X_OK); return true } catch { return false } })) return
  throw new Error(`Provider CLI command ${provider.command} was not found on PATH.`)
}

export const formatStudyProviderCliText = (config: StudyProviderCliConfigV1): readonly string[] => [
  `Provider CLI config: ${config.configVersion}`,
  `Mappings: ${config.providers.length}`,
  `Hosted providers: ${config.providers.filter((provider) => provider.providerNetwork).length}`,
  `Content hash: ${config.contentHash}`,
]
