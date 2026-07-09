import { ZodError } from 'zod'

import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from './config/schema.js'
import {
  AgentHandoffLegacySchema,
  AgentHandoffV1Schema,
  AgentSearchV1Schema,
  normalizeAgentHandoff,
  type AgentHandoffV1,
  type AgentSearchV1,
} from './schemas/agent-handoff.js'
import { DocBridgeIndexV1Schema, type DocBridgeIndexV1 } from './schemas/doc-bridge-index.js'
import {
  MemoryCandidateV1Schema,
  type MemoryCandidateV1,
} from './schemas/memory-candidate.js'

export type ParseIssue = {
  readonly path: string
  readonly message: string
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ParseIssue[] }

const zodIssues = (error: ZodError): readonly ParseIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))

export const safeParseAgentHandoff = (input: unknown): ParseResult<AgentHandoffV1> => {
  const legacy = AgentHandoffLegacySchema.safeParse(input)
  if (!legacy.success) return { ok: false, issues: zodIssues(legacy.error) }
  const normalized = AgentHandoffV1Schema.safeParse(normalizeAgentHandoff(legacy.data))
  if (!normalized.success) return { ok: false, issues: zodIssues(normalized.error) }
  return { ok: true, value: normalized.data }
}

export const parseAgentHandoff = (input: unknown): AgentHandoffV1 => {
  const result = safeParseAgentHandoff(input)
  if (!result.ok) {
    throw new Error(
      `Invalid AgentHandoff:\n${result.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`,
    )
  }
  return result.value
}

export const parseAgentSearch = (input: unknown): AgentSearchV1 => AgentSearchV1Schema.parse(input)

export const parseDocBridgeIndex = (input: unknown): DocBridgeIndexV1 =>
  DocBridgeIndexV1Schema.parse(input)

export const parseMemoryCandidate = (input: unknown): MemoryCandidateV1 =>
  MemoryCandidateV1Schema.parse(input)

export const parseDocBridgeConfig = (input: unknown): DocBridgeConfigV1 => {
  const result = DocBridgeConfigV1Schema.safeParse(input)
  if (!result.success) {
    throw new Error(
      `Invalid doc-bridge config:\n${zodIssues(result.error).map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`,
    )
  }
  return result.data
}
