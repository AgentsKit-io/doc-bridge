type JsonSchema = {
  readonly [key: string]: unknown
}

const stringArray = (maxItems: number): JsonSchema => ({
  type: 'array',
  items: { type: 'string', minLength: 1 },
  maxItems,
})

export const AgentHandoffV1JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentskit.io/schemas/doc-bridge/agent-handoff-v1.schema.json',
  title: 'AgentHandoff v1',
  type: 'object',
  additionalProperties: false,
  required: [
    'type',
    'schemaVersion',
    'source',
    'target',
    'startHere',
    'readBeforeEditing',
    'editRoots',
    'checks',
    'notes',
  ],
  properties: {
    type: { const: 'agent-handoff' },
    schemaVersion: { const: 1 },
    source: { type: 'string', minLength: 1, maxLength: 512 },
    target: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: {
          enum: ['package', 'module', 'app', 'screen', 'flow', 'component', 'intent', 'change', 'search'],
        },
        id: { type: 'string', minLength: 1, maxLength: 256 },
        path: { type: 'string', minLength: 1, maxLength: 512 },
        group: { type: 'string', minLength: 1, maxLength: 128 },
        layer: { type: 'string', minLength: 1, maxLength: 32 },
      },
    },
    startHere: { type: 'string', minLength: 1, maxLength: 512 },
    readBeforeEditing: stringArray(64),
    editRoots: stringArray(32),
    checks: stringArray(32),
    humanDoc: { anyOf: [{ type: 'string', minLength: 1, maxLength: 512 }, { type: 'null' }] },
    playbookPatterns: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 16 },
    notes: stringArray(16),
  },
} as const satisfies JsonSchema

export const MemoryCandidateV1JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentskit.io/schemas/doc-bridge/memory-candidate-v1.schema.json',
  title: 'MemoryCandidate v1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'id', 'source', 'fact', 'suggestedType', 'confidence', 'references'],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: 'string', minLength: 1, maxLength: 256 },
    source: { enum: ['cursor', 'claude', 'codex', 'copilot', 'agent-memory', 'manual'] },
    rawPath: { type: 'string', minLength: 1, maxLength: 512 },
    fact: { type: 'string', minLength: 1, maxLength: 8000 },
    why: { type: 'string', maxLength: 4000 },
    howToApply: { type: 'string', maxLength: 4000 },
    suggestedType: { enum: ['user', 'feedback', 'project', 'reference', 'unknown'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    references: stringArray(64),
  },
} as const satisfies JsonSchema

export const DocBridgeIndexV1JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentskit.io/schemas/doc-bridge/doc-bridge-index-v1.schema.json',
  title: 'DocBridgeIndex v1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'contentHash', 'contentHashAlgo', 'knowledge'],
  properties: {
    schemaVersion: { const: 1 },
    contentHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    contentHashAlgo: { const: 'sha256-normalized-v1' },
    generatedAt: { type: 'string', format: 'date-time' },
    project: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 128 },
        root: { type: 'string', minLength: 1, maxLength: 512 },
      },
    },
    properties: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64 },
          name: { type: 'string', minLength: 1, maxLength: 128 },
          url: { type: 'string', format: 'uri' },
          llms: { type: 'string', format: 'uri' },
        },
      },
    },
    knowledge: {
      type: 'array',
      maxItems: 10000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'path'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 256 },
          type: { type: 'string', minLength: 1, maxLength: 128 },
          title: { type: 'string', minLength: 1, maxLength: 256 },
          path: { type: 'string', minLength: 1, maxLength: 512 },
          description: { type: 'string', maxLength: 2048 },
          body: { type: 'string', maxLength: 8000 },
          links: stringArray(64),
          tags: stringArray(32),
        },
      },
    },
    capabilities: {
      type: 'array',
      maxItems: 5000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 256 },
          kind: { type: 'string', minLength: 1, maxLength: 64 },
          description: { type: 'string', maxLength: 512 },
        },
      },
    },
    handoffs: {
      type: 'object',
      additionalProperties: { type: 'object' },
    },
    lookup: { type: 'object' },
  },
} as const satisfies JsonSchema

export const DocBridgeJsonSchemas = {
  agentHandoffV1: AgentHandoffV1JsonSchema,
  docBridgeIndexV1: DocBridgeIndexV1JsonSchema,
  memoryCandidateV1: MemoryCandidateV1JsonSchema,
} as const
