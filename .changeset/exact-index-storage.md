---
"@agentskit/doc-bridge": minor
---

Add exact-partition reader-backed index building and artifact persistence APIs while retaining synchronous local index and handoff payload compatibility. Report missing or mismatched document bodies beside the payload and isolate enrichment caches, approvals and workflow artifacts by repository and revision.

Expose the injected storage, discovery, partitioned index and typed persistence entrypoints from the package root, with a caller-facing exact-revision guide.
