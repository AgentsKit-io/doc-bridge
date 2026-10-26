---
type: module
id: doc-bridge-registry-agents
editRoot: agents
humanDoc: /docs/spec/registry-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: agents
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:agents
---

# Registry agents

The `agents` directory holds the Registry agent packages: `content-fact-checker`,
`content-style-guide-enforcer` and `ecosystem-doc-bridge-corpus-scanner`. Each has a `README.md`
describing its pain and output, an `agent.ts` definition and an `eval.ts`. They are separate from
the CLI in `src`; how Registry agents compose doc-bridge tools is described in the human doc.
