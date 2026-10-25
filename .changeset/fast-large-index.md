---
'@agentskit/doc-bridge': patch
---

Speed up `ak-docs index` on large repositories without changing `index.json` or `capabilities.json`: glob patterns are compiled once instead of once per file, area assignment no longer scans every area for every module, and per-document Markdown analysis reuses lookups built once per scan. Adds a deterministic large-fixture generator and benchmark (`scripts/generate-large-fixture.mjs`, `scripts/bench-large-index.mjs`).
