---
title: Analyzer plugin contract v1
description: Language-neutral extension point for Doc Bridge analyzers.
---

# Analyzer plugin contract v1

An analyzer plugin declares an `id`, version, supported languages/frameworks, capabilities, knowledge schema version, compatible pipeline major, unsupported constructs, and resource limits. Registration validates this manifest before scanning and keeps plugin order deterministic by ID.

The plugin receives bounded file metadata and may return canonical entities, relations, coverage, and diagnostics. The common registry validates that output, stamps coverage with the plugin identity/version, and converts malformed plugin output into `not-analyzed` coverage. A plugin failure never becomes complete analysis and does not affect unrelated registered plugins.

Configuration selects plugins with `analysis.plugins`. `enabled`, `order`, `options`, and any override `reason` are explicit. The common workflow, report, CLI, MCP, and verification contracts consume the canonical output and do not need to change when a new language analyzer is added.

```ts
const registry = createAnalyzerRegistry({ pipelineVersion: '1.0.0' })
registry.register({
  manifest: {
    id: 'example-analyzer', version: '1.0.0', languages: ['example'], frameworks: [],
    capabilities: ['entities', 'relations'], knowledgeSchemaVersion: 1,
    compatibility: { pipelineMajor: 1 }, unsupportedConstructs: [], resourceLimits: { maxFiles: 10_000 },
  },
  analyze: () => ({ entities: [], relations: [], coverage: [], diagnostics: [] }),
})
```

## Additive discovery v2

[Discovery plugin v2](discovery-plugin-v2.md) adds exact-partition bounded reads,
typed surface/package facts, version/release hooks and issued-evidence validation.
It has separate strict manifest/input/output schemas and a separate registry;
v2 fields are never appended to a v1 object. Existing v1 consumers keep their
original exports and byte-compatible field sets. Discovery migration is separate.

## Caller service profile

The caller-selected [service profile v1](service-profile-v1.md) restricts this
surface before repository configuration is interpreted. Repository config admits
only the enumerated leaves; ignored options retain path-only diagnostics and
`not-analyzed` coverage. Agent execution, repository module imports, federation,
watch and legacy writes are denied. Service library calls use injected storage;
service CLI writes require `--artifact-root`. MCP mutating/agent operations and
filesystem fallbacks are refused. Ordinary local calls remain unchanged.
