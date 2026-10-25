---
'@agentskit/doc-bridge': patch
---

`ak-docs doctor` now reports index freshness from the same computation as `ak-docs gate run`, so the two agree on the same tree and doctor no longer loses points to a freshness verdict the gate does not share.
