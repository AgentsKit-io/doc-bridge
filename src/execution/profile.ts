import { AsyncLocalStorage } from 'node:async_hooks'
import type { DocBridgeConfigV1 } from '../config/schema.js'
import type { Coverage } from '../schemas/knowledge.js'

export type ExecutionProfile = 'local' | 'service'
export type ExecutionContext = Readonly<{ profile: ExecutionProfile }>
const contexts = new AsyncLocalStorage<ExecutionContext>()
const bound = new WeakMap<object, ExecutionContext>()
const local = Object.freeze({ profile: 'local' as const })
const service = Object.freeze({ profile: 'service' as const })
/** Caller-owned ceiling; nested calls cannot restore local capabilities. */
export const executionContext = (profile?: ExecutionProfile): ExecutionContext => {
  if (profile !== undefined && profile !== 'local' && profile !== 'service') throw new Error('Unknown execution profile')
  return contexts.getStore()?.profile === 'service' || profile === 'service' ? service : local
}
export const withExecutionProfile = <T>(profile: ExecutionProfile | undefined, run: () => T): T => contexts.run(executionContext(profile), run)
export const isServiceProfile = (config?: object): boolean => contexts.getStore()?.profile === 'service' || (config !== undefined && bound.get(config)?.profile === 'service')
export const denyServiceOperation = (operation: string, config?: object): void => {
  if (isServiceProfile(config)) throw new Error(`not-analyzed: service profile denies ${operation}; use caller-provided storage for supported operations.`)
}
export const bindServiceCapability = <T extends object>(value: T): T => { bound.set(value, service); return value }
export const bindServiceConfig = (config: DocBridgeConfigV1): DocBridgeConfigV1 => bindServiceCapability(config)
export const serviceCoverage = (diagnostics: readonly string[] = []): Coverage[] => [
  ...['repository modules', 'agent and study processes', 'federation and providers', 'memory publication', 'watch', 'local filesystem writes', 'natural-language correctness'].map(scope => ({ analyzer: 'service-profile', analyzerVersion: '1.0.0', scope, status: 'not-analyzed' as const, reason: 'Denied by caller service capability ceiling.' })),
  ...diagnostics.map(path => ({ analyzer: 'service-profile', analyzerVersion: '1.0.0', scope: path.slice(0, 512), status: 'not-analyzed' as const, reason: 'Repository option ignored or restricted by service-profile-v1 ceiling.' })),
]
