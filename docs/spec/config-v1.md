# doc-bridge config contract v1

`doc-bridge.config.ts` (or `.js`, `.mjs`, `.json`, or `package.json` → `docBridge`) is the alpha integration point for any project. Layer 0 fields are sufficient to run `index`, `query`, and MCP without an LLM.

| npm package | `@agentskit/doc-bridge` |
| CLI binary | `ak-docs` |
| Config file | `doc-bridge.config.ts` |

Standalone CLI — not merged into a framework or OS CLI.

## Design rules

1. **Progressive** — only `schemaVersion` + `corpus.agent` required; everything else defaults sensibly.
2. **Plugin-shaped** — doc sites and monorepo layout are plugins, not hardcoded paths.
3. **No provider in core** — adapter config lives under `intelligence`, never required.
4. **Deterministic output** — paths in config are resolved at build time; no timestamps in index hash input.
5. **One config per repo** — monorepo root config; packages inherit via `routing` / plugin discovery.

## Discovery order

```
doc-bridge.config.ts
doc-bridge.config.mts
doc-bridge.config.js
doc-bridge.config.mjs
doc-bridge.config.json
package.json → "docBridge" field (subset, JSON only)
```

TypeScript/JavaScript configs are static in v0.1 alpha: `defineConfig` imports are supported, but arbitrary imports are not. YAML config files are planned.

## TypeScript shape (authoritative)

```ts
import type { DocBridgeConfigV1 } from '@agentskit/doc-bridge/config'

export default {
  schemaVersion: 1,

  /** Optional display name; defaults to package.json name or directory basename */
  project?: { name?: string; root?: string }

  /** Agent-readable knowledge (required) */
  corpus: {
    agent: AgentCorpusConfig
    human?: HumanCorpusConfig | HumanCorpusConfig[]
  }

  /** Where deterministic artifacts are written */
  index?: IndexConfig

  /** Ownership, intents, change routes — monorepo plugin fills this */
  routing?: RoutingConfig

  /** CI gate presets */
  gates?: GatesConfig

  /** CLI + MCP surfaces */
  surfaces?: SurfacesConfig

  /** Optional: chat, memory, retriever — any provider */
  intelligence?: IntelligenceConfig

  /** Optional: Playbook / Registry / remote OKF bundles */
  federation?: FederationConfig
} satisfies DocBridgeConfigV1
```

---

## `corpus.agent` (required)

Agent corpus = dense markdown for coding agents (OKF or for-agents layout).

```ts
type AgentCorpusConfig = {
  /** Root directory, relative to project root */
  root: string                    // e.g. 'docs/for-agents' | '.agent-docs' | 'docs'

  /** Jump table entrypoint (recommended) */
  index?: string                  // default: '{root}/INDEX.md'

  /**
   * Glob patterns under root, relative to root.
   * Default: ['**/*.md'] excluding INDEX conventions
   */
  include?: string[]
  exclude?: string[]              // default: ['**/node_modules/**', '**/.git/**']

  /** OKF frontmatter: require `type` field (soft warn vs hard gate) */
  okf?: {
    requireType?: boolean         // default: false (warn); true in strict preset
    allowedTypes?: string[]       // optional vocabulary enforcement
  }
}
```

### Minimal solo project

```ts
corpus: {
  agent: { root: 'docs' }
}
```

---

## `corpus.human` (optional)

Human wiki / doc site. **Always via plugin** — doc-bridge does not ship a site generator.

```ts
type HumanCorpusConfig = {
  plugin: HumanCorpusPluginId
  /** Plugin-specific options (see plugin docs) */
  options?: Record<string, unknown>
}

type HumanCorpusPluginId =
  | 'plain-markdown'    // docs/**/*.md, frontmatter `package`/`module`/`id`
  | 'fumadocs'          // markdown scan with index routes, (group) slugs, pages allowlists
  | 'docusaurus'        // markdown scan with id/slug frontmatter + static sidebars.js
  | 'mkdocs'            // planned
  | 'vitepress'         // planned
  | 'custom'            // path to user plugin module
```

### Bridge to agent docs

When `corpus.human` is set, plugins MUST:

1. Emit resolvable `humanDoc` URLs/paths into `AgentHandoff`
2. Support `## Human guide` link validation (gate `human-guide-links`)
3. Map by stable id (`packageId`, `moduleId`, `slug`) — config defines the join key

```ts
corpus: {
  agent: { root: 'docs/for-agents' },
  human: {
    plugin: 'fumadocs',
    options: {
      contentDir: 'apps/web/content/docs',
      urlPrefix: '/docs',           // public path prefix
      metaFile: 'meta.json',
    },
  },
}
```

Multiple human corpora (e.g. marketing + internal):

```ts
human: [
  { plugin: 'fumadocs', options: { contentDir: 'apps/web/content/docs', urlPrefix: '/docs' } },
  { plugin: 'plain-markdown', options: { root: 'docs/internal', urlPrefix: null } },
]
```

---

## `index` (optional)

```ts
type IndexConfig = {
  /** Output path for DocBridgeIndex JSON */
  outFile?: string                // default: '.doc-bridge/index.json'

  /** Optional llms.txt alongside index */
  llmsTxt?: {
    enabled?: boolean             // default: true
    outFile?: string              // default: 'llms.txt' at project root
    preamble?: string             // project-specific intro paragraph
  }

  /** Optional Self-Describe companion artifact */
  capabilities?: {
    enabled?: boolean             // default: true
    outFile?: string              // default: '.doc-bridge/capabilities.json'
  }

  /** Hash algorithm for contentHash field */
  contentHash?: 'sha256-normalized-v1'  // only algo in v1
}
```

---

## `routing` (optional — monorepo-first)

Without `routing`, handoffs are inferred from agent corpus links only. Monorepo plugin populates ownership graph.

```ts
type RoutingConfig = {
  plugin?: 'pnpm-monorepo' | 'npm-workspaces' | 'yarn-workspaces' | 'custom'

  options?: {
    /** Workspace globs; default from package manager */
    packages?: string[]           // e.g. ['packages/*', 'apps/*']

    /** Map package id → metadata (auto-discovered if omitted) */
    ownership?: Record<string, OwnershipEntry>

    /** Curated reading paths for tasks */
    intents?: IntentEntry[]

    /** "I want to change X" → start here */
    changes?: ChangeRouteEntry[]
  }
}

type OwnershipEntry = {
  path: string                    // 'packages/auth'
  group?: string                  // logical layer / team
  layer?: string                  // L0–L4 or custom
  purpose?: string                // one line
  checks?: string[]               // default gates for this owner
  agentDoc?: string               // override path; default inferred
  humanDoc?: string               // filled by human plugin join
}

type IntentEntry = {
  id: string                      // kebab-case
  title: string
  paths: string[]                 // read-before-editing list
}

type ChangeRouteEntry = {
  id: string                      // e.g. 'add-api-endpoint'
  title: string
  startHere: string
  relatedPackages?: string[]
}
```

### Join keys (agent ↔ human ↔ ownership)

| Entity | Primary key | Human plugin maps via |
|--------|-------------|------------------------|
| Package / module | `id` (folder name or `package.json` name) | frontmatter `package` or path convention |
| Screen / feature | `id` in `screens/` or `features/` | MDX slug |
| Flow / recipe | `id` in `flows/` | docs slug |

Plugins document their join convention; gates fail on orphan links.

---

## `gates` (optional)

```ts
type GatesConfig = {
  preset?: 'minimal' | 'standard' | 'strict'
  /** Enabled gate ids; merged with preset */
  include?: GateId[]
  exclude?: GateId[]
  /** Gate-specific options */
  options?: {
    'human-guide-links'?: { strict?: boolean }
    'index-freshness'?: { failOnDrift?: boolean }
    'okf-type'?: { requireType?: boolean }
    'docs-style'?: {
      profile?: 'google-dev-docs' | 'playbook-okf' | 'custom'
      required?: Array<
        | 'title'
        | 'purpose'
        | 'audience'
        | 'task-orientation'
        | 'examples'
        | 'owner-source'
        | 'no-stale-wording'
      >
    }
    'link-rot'?: { scanDirs?: string[] }
  }
}

type GateId =
  | 'index-freshness'
  | 'human-guide-links'
  | 'link-rot'
  | 'okf-type'
  | 'docs-style'
  | 'routing-currency'             // every workspace package appears in routing
  | 'bootstrap-size'               // AGENTS.md / CLAUDE.md line budgets
```

| Preset | Gates |
|--------|-------|
| `minimal` | `index-freshness` |
| `standard` | + `human-guide-links` in v0.1 alpha |
| `strict` | + `okf-type` in v0.1 alpha |

Implemented alpha gates: `index-freshness`, `human-guide-links`, `okf-type`, `docs-style`. `include` / `exclude` are applied to implemented gates only.

### Structural vs style validation

Alpha gates are deterministic lint checks, not editorial grading:

| Gate | Kind | What it proves |
|------|------|----------------|
| `index-freshness` | structural | Generated index matches current docs/config |
| `human-guide-links` | structural | Local `humanDoc` links resolve through configured human-doc adapters |
| `okf-type` | OKF lint | Agent docs have required `type:` frontmatter when strict/required |
| `docs-style` | style lint | Opt-in deterministic profile checks for title, purpose, audience, examples, owner/source, task orientation, and stale wording |

`docs-style` supports `google-dev-docs`, `playbook-okf`, and `custom` profiles. It is not part of the default alpha path and does not grade prose quality; it checks for explicit structural signals. LLM critique remains planned optional behavior.

---

## `surfaces` (optional)

```ts
type SurfacesConfig = {
  cli?: {
    /** Published binary name (package.json bin) */
    bin?: string                    // default: 'ak-docs'
    /** Default output: json | text */
    defaultFormat?: 'json' | 'text'
  }

  mcp?: {
    enabled?: boolean               // default: true
    /** Tool ids to expose; default: core set */
    tools?: McpToolId[]
    transport?: 'stdio' | 'http'
    http?: { port?: number; path?: string }
  }
}

type McpToolId =
  | 'handoff.resolve'
  | 'doc.search'                   // deterministic index search
  | 'doc.get'
  | 'gate.status'
  | 'playbook.pattern.get'         // requires federation
```

---

## `intelligence` (optional — any provider)

Absent `intelligence` = Layer 0 only. AgentsKit is the **reference implementation** of this block.

```ts
type IntelligenceConfig = {
  /** When false, ignore all other intelligence fields */
  enabled?: boolean                 // default: false

  adapter?: {
    /** Provider id or path to custom adapter module */
    provider: 'openai' | 'anthropic' | 'ollama' | 'openrouter' | 'custom'
    model?: string
    /** Env var name for API key; never inline secrets in config */
    apiKeyEnv?: string
    baseUrl?: string
    options?: Record<string, unknown>
  }

  chat?: {
    enabled?: boolean
    /** Corpus scopes for retrieval */
    sources?: ('agent' | 'human' | 'federation')[]
    /** Prefer deterministic handoff before RAG when confidence high */
    handoffFirst?: boolean          // default: true
  }

  retriever?: {
    enabled?: boolean
    /** local | remote | bm25-only */
    mode?: 'local' | 'remote' | 'bm25'
    embedModel?: string
    chunkSize?: number
  }

  memory?: {
    enabled?: boolean
    adapters?: MemoryAdapterId[]
    ingestDir?: string              // default: '.agent-memory'
    classify?: boolean              // default: false — opt-in
    promote?: {
      enabled?: boolean
      targets?: ('agent' | 'human' | 'agents-md')[]
      requireApproval?: boolean     // default: true
    }
  }

  /** Reference runtime; custom path for non-AgentsKit engines later */
  runtime?: 'agentskit' | 'custom'
  runtimeModule?: string
}

type MemoryAdapterId =
  | 'playbook-memory'              // .agent-memory/MEMORY.md layout
  | 'cursor-rules'                 // .cursor/rules/*.mdc
  | 'session-export'               // manual JSON/md drop folder
  | 'bootstrap-delta'              // git diff on AGENTS.md
```

---

## `federation` (optional — ecosystem)

Not required for any project. Private dogfood enables this profile to validate scale; public consumers do not depend on private repos.

```ts
type FederationConfig = {
  enabled?: boolean
  sources?: FederationSource[]
}

type FederationSource = {
  id: string                        // 'playbook' | 'agentskit' | custom
  llmsTxt?: string                  // URL or local path
  rawBaseUrl?: string               // e.g. 'https://playbook.agentskit.io/raw'
  includeInRetriever?: boolean
  includeInChat?: boolean
}
```

Layer 0 exports a local retriever helper over `DocBridgeIndex`:

```ts
import { createDocBridgeRetriever } from '@agentskit/doc-bridge'

const retriever = createDocBridgeRetriever(index, { property: 'my-project' })
const chunks = retriever.retrieve('auth ownership')
```

Chunk keys are stable: `{property}:{type}:{id}`. Deterministic CLI search and exact handoff resolution stay first; semantic/RAG runtimes can inject this retriever and add federated sources later.

---

## `AgentHandoff` emission rules

When `ak-docs query <target> --agent` runs:

```ts
type AgentHandoffV1 = {
  type: 'agent-handoff'
  schemaVersion: 1
  source: string                    // index.outFile path
  target: { type: TargetType; id: string }
  startHere: string
  readBeforeEditing: string[]
  editRoots: string[]
  checks: string[]
  humanDoc?: string | null
  playbookPatterns?: string[]       // only if federation enabled
  notes: string[]
}

type TargetType =
  | 'package' | 'module' | 'app'
  | 'screen' | 'flow' | 'component'
  | 'intent' | 'change'
  | 'search'                       // --agent on search picks best match
```

**Merge precedence** (later wins):

1. Agent corpus frontmatter (`checks`, `humanDoc`)
2. `routing.ownership[id]`
3. `gates.preset` default checks
4. Global `handoff.defaults` (if set in future minor version)

---

## Example configs

### 1. Solo library (minimal)

```ts
// doc-bridge.config.ts
import { defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: {
      root: 'docs',
      index: 'docs/INDEX.md',
    },
  },
})
```

### 2. pnpm monorepo + ownership

```ts
import { defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
  },
  routing: {
    plugin: 'pnpm-monorepo',
    options: {
      packages: ['packages/*', 'apps/*'],
    },
  },
  gates: { preset: 'standard' },
})
```

### 3. Monorepo + Fumadocs (standard profile)

```ts
import { defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: {
      plugin: 'fumadocs',
      options: {
        contentDir: 'apps/web/content/docs',
        urlPrefix: '/docs',
      },
    },
  },
  routing: { plugin: 'pnpm-monorepo' },
  gates: { preset: 'standard' },
  intelligence: {
    enabled: true,
    adapter: { provider: 'ollama', model: 'llama3', apiKeyEnv: '' },
    chat: { enabled: true, handoffFirst: true },
  },
})
```

### 4. Docusaurus + optional memory

```ts
import { defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    agent: { root: '.agent-docs' },
    human: {
      plugin: 'docusaurus',
      options: {
        docsDir: 'website/docs',
        sidebarsFile: 'website/sidebars.js',
        urlPrefix: '/docs',
      },
    },
  },
  intelligence: {
    enabled: true,
    adapter: { provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKeyEnv: 'OPENROUTER_API_KEY' },
    chat: { enabled: true, sources: ['agent', 'human'] },
    memory: {
      enabled: true,
      adapters: ['cursor-rules', 'playbook-memory'],
      classify: true,
      promote: { enabled: true, requireApproval: true },
    },
  },
})
```

### 5. JSON config (no TypeScript)

```json
{
  "schemaVersion": 1,
  "corpus": {
    "agent": { "root": "docs/for-agents" }
  },
  "routing": {
    "plugin": "npm-workspaces"
  },
  "gates": { "preset": "minimal" }
}
```

---

## CLI mapping

| Command | Config sections used |
|---------|---------------------|
| `ak-docs init` | scaffolds minimal `corpus.agent` + optional plugin prompt |
| `ak-docs index` | `corpus`, `routing`, `index`, plugins |
| `ak-docs query <t> --agent` | `index` + `routing` + handoff merge |
| `ak-docs search <q>` | `index` |
| `ak-docs retrieve <q>` | `index` + `federation` |
| `ak-docs gate run` | `gates` |
| `ak-docs mcp` | `surfaces.mcp` |
| `ak-docs chat` | planned; `intelligence.*` |
| `ak-docs memory ingest` | deterministic local ingest; `MemoryCandidate[]` |
| `ak-docs memory classify` | deterministic route classifier |
| `ak-docs memory promote` | draft promotion + safety scan |
| `ak-docs registry topology` | doc-curator topology |
| `ak-docs playbook draft` | draft Playbook feedback payload |

---

## Validation

- Config validated with **Zod** at CLI startup (`ak-docs validate-config`).
- Unknown `schemaVersion` → hard error with migration link.
- Unknown plugin id → hard error listing built-in + `custom` path.
- `intelligence.enabled: true` without `adapter` → warn + chat/memory subcommands disabled.

---

## Versioning

| Version | Scope |
|---------|-------|
| **v1** | This document. Additive fields only in v1.x. |
| **v2** | Breaking changes require `schemaVersion: 2` + codemod. |

---

## See also

- [POSITIONING.md](../POSITIONING.md)
- [AgentHandoff v1](../schemas/agent-handoff-v1.md)
- [DocBridgeIndex v1](../schemas/doc-bridge-index-v1.md)
- [MemoryCandidate v1](../schemas/memory-candidate-v1.md)
