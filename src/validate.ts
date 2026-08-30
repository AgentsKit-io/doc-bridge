import { ZodError } from 'zod'

import { DocBridgeConfigV1Schema, type DocBridgeConfigV1 } from './config/schema.js'
import {
  AgentHandoffLegacySchema,
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
import {
  AgentProposalV1Schema,
  DiscoverySnapshotV1Schema,
  FixProposalV1Schema,
  ReconciliationReportV1Schema,
  WorkflowRunV1Schema,
  type AgentProposalV1,
  type DiscoverySnapshotV1,
  type FixProposalV1,
  type ReconciliationReportV1,
  type WorkflowRunV1,
} from './schemas/knowledge.js'

export type ParseIssue = {
  readonly path: string
  readonly message: string
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ParseIssue[] }

const zodMessage = (issue: ZodError['issues'][number]): string => {
  if (issue.code === 'invalid_type' && issue.message.endsWith('received undefined')) return 'Required'
  if (issue.code === 'invalid_value' && 'values' in issue) return 'Invalid enum value'
  return issue.message
}

const zodIssues = (error: ZodError): readonly ParseIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: zodMessage(issue),
  }))

export const safeParseAgentHandoff = (input: unknown): ParseResult<AgentHandoffV1> => {
  const legacy = AgentHandoffLegacySchema.safeParse(input)
  if (!legacy.success) return { ok: false, issues: zodIssues(legacy.error) }
  return { ok: true, value: normalizeAgentHandoff(legacy.data) }
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

export const parseDiscoverySnapshot = (input: unknown): DiscoverySnapshotV1 =>
  DiscoverySnapshotV1Schema.parse(input)

export const parseReconciliationReport = (input: unknown): ReconciliationReportV1 =>
  ReconciliationReportV1Schema.parse(input)

export const parseWorkflowRun = (input: unknown): WorkflowRunV1 => WorkflowRunV1Schema.parse(input)

export const parseAgentProposal = (input: unknown): AgentProposalV1 => AgentProposalV1Schema.parse(input)

export const parseFixProposal = (input: unknown): FixProposalV1 => FixProposalV1Schema.parse(input)

export const parseDocBridgeConfig = (input: unknown): DocBridgeConfigV1 => {
  const result = DocBridgeConfigV1Schema.safeParse(input)
  if (!result.success) {
    throw new Error(
      `Invalid doc-bridge config:\n${zodIssues(result.error).map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`,
    )
  }
  return result.data
}
