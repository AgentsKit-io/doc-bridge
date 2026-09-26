---
"@agentskit/doc-bridge": patch
---

The documentation-standard ecosystem contract no longer hard-codes product membership. It used to require the deprecated `properties` shim to project either a fixed three-product list that included Playbook or a fixed six-product list without Harness, which forced repositories to keep a hidden `playbook` record in `ecosystem.json`. Membership now comes from the canonical manifest: the shim is optional, and each entry must name a distinct `products[]` record and match it exactly.
