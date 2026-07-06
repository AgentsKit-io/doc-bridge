import { z } from 'zod'

export const HANDOFF_SCHEMA_VERSION = 1 as const

export const HandoffTargetTypeSchema = z.enum([
  'package',
  'module',
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

/** v1 — canonical AgentHandoff. AKOS legacy payloads may omit schemaVersion. */
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
    playbookPatterns: z.array(z.string().url()).max(16).optional(),
    notes: z.array(z.string().min(1).max(1024)).max(16),
  })
  .strict()

export type AgentHandoffV1 = z.infer<typeof AgentHandoffV1Schema>

/** Accept AKOS / legacy handoffs without schemaVersion. */
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
  })
  .strict()

export type AgentSearchV1 = z.infer<typeof AgentSearchV1Schema>

export const normalizeAgentHandoff = (input: unknown): AgentHandoffV1 =>
  AgentHandoffV1Schema.parse(AgentHandoffLegacySchema.parse(input))