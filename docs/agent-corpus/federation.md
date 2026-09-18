---
type: module
id: doc-bridge-federation
editRoot: src/federation
humanDoc: /docs/spec/config-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/federation
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/federation
---

# Federation

Owns loading external llms.txt sources, parsing chunks from remote and local markdown, scoring
them against queries, and formatting ecosystem product blocks for federation.

`loadFederatedChunks` fetches llms.txt sources from configuration, parses markdown sections into
searchable chunks, and follows same-origin links to collect more content. `retrieveHybridChunks`
merges local retrieval results and federated chunks, deduplicating by key and re-ranking by
query relevance. `parseLlmsTxtLinks` extracts markdown links and bare URLs from prose. The
ecosystem formatter generates a canonical markdown block for llms.txt sections across products.

