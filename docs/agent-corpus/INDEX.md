---
type: module
id: doc-bridge-index
editRoot: src/index-builder
humanDoc: /docs/recipes/index-pipeline
---

# Index builder

Owns corpus scanning, handoffs, hashes, `llms.txt`, and watch mode. Generated output must remain deterministic.

`project-corpus.ts` projects every repository document and source module into `index.knowledge`
so retrieval can see what the discovery snapshot sees; it must walk the same files under the same
safety limits, which is why both import from `src/discovery/inputs.ts`. One walk produces both the
entries and the `inputs` fingerprint, so the hash can never describe a different file set than the
one projected. `llms.txt` stays curated — the renderer filters projected entries out, and the
conformance profile re-renders to check freshness, so the filter belongs there and nowhere else.
