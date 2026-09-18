---
type: module
id: doc-bridge-playbook
editRoot: src/playbook
humanDoc: /docs/playbook/doc-bridge-pattern
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/playbook
validationPath: pnpm test && node bin/ak-docs.js index
docbridge:
  covers:
    - area:src/playbook
---

# Playbook

Owns the Doc Bridge Pattern playbook content and metadata. Exports `DOC_BRIDGE_PATTERN_META`
with pattern id, title, slug, license (CC-BY-4.0), and links to the public playbook URL and
npm package. `docBridgePatternMarkdown()` generates the pattern description — problem, solution
with three artifacts (AgentHandoff, DocBridgeIndex, self-describe), four operational loops
(act, bridge, learn, explain), MCP contract, CI gate, coverage metrics, and use-case guidance.
`docBridgePatternPayload()` returns the complete pattern object for registration.
