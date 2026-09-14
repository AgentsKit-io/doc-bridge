import { z } from 'zod'

export const HANDOFF_SCHEMA_VERSION = 1 as const

export const HandoffTargetTypeSchema = z.enum([
  'package',
  'area',
  'module',
  'document',
  'app',
  'screen',
  'flow',
  'component',
  'intent',
  'change',
  'search',
])

export type HandoffTargetType = z.infer<typeof HandoffTargetTypeSchema>

export const HandoffTargetSchema = z
  .object({
    type: HandoffTargetTypeSchema,
    id: z.string().min(1).max(256),
    path: z.string().min(1).max(512).optional(),
    group: z.string().min(1).max(128).optional(),
    layer: z.string().min(1).max(32).optional(),
  })
  .strict()

export type HandoffTarget = z.infer<typeof HandoffTargetSchema>

export const HandoffBridgeSchema = z
  .object({
    humanDoc: z.enum(['linked', 'missing', 'external']),
    action: z.string().min(1).max(256).optional(),
    bootstrap: z.string().min(1).max(256).optional(),
  })
  .strict()

export type HandoffBridge = z.infer<typeof HandoffBridgeSchema>

/** An area or package this target's code depends on, or that depends on it, with what proves it. */
export const HandoffRelatedSchema = z
  .object({
    id: z.string().min(1).max(256),
    path: z.string().min(1).max(512),
    direction: z.enum(['imports', 'imported-by']),
    /** How many import edges cross the boundary. */
    strength: z.number().int().positive(),
    evidence: z.array(z.string().min(1).max(512)).max(8),
  })
  .strict()

export type HandoffRelated = z.infer<typeof HandoffRelatedSchema>

/** v1 — canonical AgentHandoff. Legacy payloads may omit schemaVersion. */
export const AgentHandoffV1Schema = z
  .object({
    type: z.literal('agent-handoff'),
    schemaVersion: z.literal(HANDOFF_SCHEMA_VERSION).default(HANDOFF_SCHEMA_VERSION),
    source: z.string().min(1).max(512),
    target: HandoffTargetSchema,
    startHere: z.string().min(1).max(512),
    readBeforeEditing: z.array(z.string().min(1).max(512)).max(64),
    editRoots: z.array(z.string().min(1).max(512)).max(32),
    checks: z.array(z.string().min(1).max(256)).max(32),
    humanDoc: z.string().min(1).max(512).nullable().optional(),
    bridge: HandoffBridgeSchema.optional(),
    playbookPatterns: z.array(z.string().url()).max(16).optional(),
    notes: z.array(z.string().min(1).max(1024)).max(16),
    /*
     * Optional additions, so a handoff built before they existed is still a valid handoff and a
     * reader that predates them sees the same fields it always did.
     */
    related: z.array(HandoffRelatedSchema).max(16).optional(),
    /** Which relations produced each field, by field name. */
    explain: z.record(z.string().min(1).max(64), z.array(z.string().min(1).max(512)).max(16)).optional(),
    evidence: z
      .array(
        z
          .object({
            source: z.enum(['code', 'configuration', 'documentation', 'agent', 'derived']),
            path: z.string().min(1).max(512),
            lineStart: z.number().int().positive().optional(),
            lineEnd: z.number().int().positive().optional(),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            context: z.string().max(1_024).optional(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    metadata: z.record(z.string().min(1).max(64), z.unknown()).optional(),
  })
  .strict()

export type AgentHandoffV1 = z.infer<typeof AgentHandoffV1Schema>

/** Accept legacy handoffs without schemaVersion. */
export const AgentHandoffLegacySchema = AgentHandoffV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(HANDOFF_SCHEMA_VERSION).optional(),
})

export const AgentSearchMatchSchema = z
  .object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
    path: z.string().min(1).max(512),
    summary: z.string().max(2048).optional(),
    score: z.number().optional(),
    refs: z.number().int().nonnegative().optional(),
  })
  .strict()

export const AgentSearchV1Schema = z
  .object({
    type: z.literal('agent-search'),
    schemaVersion: z.literal(HANDOFF_SCHEMA_VERSION).default(HANDOFF_SCHEMA_VERSION),
    source: z.string().min(1).max(512),
    term: z.string().min(1).max(512),
    count: z.number().int().nonnegative(),
    bestMatch: AgentSearchMatchSchema.nullable(),
    matches: z.array(AgentSearchMatchSchema).max(32),
    nextCommands: z.array(z.string().min(1).max(512)).max(16),
    telemetry: z
      .object({
        contextBytes: z.number().int().nonnegative(),
        estimatedTokens: z.number().int().nonnegative(),
        tokenMethod: z.literal('estimate'),
      })
      .strict()
      .optional(),
  })
  .strict()

export type AgentSearchV1 = z.infer<typeof AgentSearchV1Schema>

export const normalizeAgentHandoff = (input: unknown): AgentHandoffV1 =>
  AgentHandoffV1Schema.parse(AgentHandoffLegacySchema.parse(input))
