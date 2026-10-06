---
"@agentskit/doc-bridge": minor
---

Version semantic snapshot, derived report, retrieval and index identity as sha256-semantic-v1,
excluding revision/time and scan reuse provenance. Preserve legacy verification and study hashes.

Migration: upgrade readers before explicitly running ak-docs index. Old strict readers reject the
new algorithm with a schema error. Freshness verifies legacy indexes under their original algorithm;
explicit regeneration warns about committed legacy drift before writing the migrated index.
