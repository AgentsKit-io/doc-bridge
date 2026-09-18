---
type: module
id: doc-bridge-plugins
editRoot: src/plugins
humanDoc: /docs/spec/analyzer-plugin-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/plugins
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/plugins
---

# Plugins

Owns the analyzer plugin contract and registry. `AnalyzerPluginManifestSchema` defines a plugin's
identity, languages, frameworks, capabilities, and resource limits. `AnalyzerPluginOutputSchema`
validates entities, relations, coverage, and diagnostics. `createAnalyzerRegistry` registers
plugins and routes `analyze` calls; it enforces pipeline major version compatibility, detects
resource overruns (file count, byte size), and catches plugin failures gracefully — returning
a coverage entry with failure reason rather than throwing. Output coverage records always
include the analyzer id and version.
