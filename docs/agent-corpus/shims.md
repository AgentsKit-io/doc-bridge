---
type: module
id: doc-bridge-shims
editRoot: src/shims
humanDoc: /docs/POSITIONING
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/shims
validationPath: pnpm typecheck && pnpm test
docbridge:
  covers:
    - area:src/shims
---

# Shims

Owns ambient type declarations for what the published packages do not type correctly themselves. Two
files, and both exist to keep `pnpm typecheck` honest rather than to change behaviour.

`agentskit-peers.d.ts` declares the optional AgentsKit peers (`@agentskit/rag`, `memory`, `adapters`,
`core`, `ink`) plus `ink` and `react`, so the tree typechecks whether or not those packages are
installed. `graphology.d.ts` covers the mismatch between the library's CommonJS declarations and its
ESM build under `moduleResolution: NodeNext`.

A shim is a claim about someone else's API, so it can drift silently: nothing here fails when the
upstream types change, only the code that trusted them.
