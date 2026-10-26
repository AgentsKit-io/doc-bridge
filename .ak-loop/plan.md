# Plan followed

1. Added 8 area docs in docs/agent-corpus/ (where this repo keeps agent docs): enrich, vault, diff,
   execution, studio, entities, agents, integrations. Each names only exports/files that exist.
2. Added docbridge.covers to existing docs that really describe the area: change-set-v1 (src/diff),
   vault-export-v1, vault-diff-v1, ADR 0020 (src/vault), service-profile-v1 (src/execution),
   ADR 0018 (src/entities), knowledge-engine-runbook (src/workflow, via its workflow artifacts).
   No dedicated workflow page: an earlier attempt outranked src/workflow/engine.ts in the bench.
3. No exclusions, no baseline, no generated file changes. Bench re-run: hit@3 unchanged.
