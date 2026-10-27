# Plan followed

1. Built the repo (pnpm install runs the prepare build) and ran `ak-docs index` / `doctor`: B 95, connectivity 70%
   (41/50 areas, 117/201 documents linked). Undocumented areas: agents, integrations, src/diff, src/enrich,
   src/entities, src/execution, src/studio, src/vault, src/workflow.
2. Added a short "Source"/"Implementation" paragraph to existing docs that really describe that code
   (agent READMEs, Obsidian README, vault/gate/MCP/index guides, specs and ADRs), citing real files and directories.
3. No exclusions were needed, no config change, no new docs, benchmark suite untouched.
4. Re-indexed: A 97, connectivity 84% (50/50 areas, 137/201 documents), hit@3 88.3% unchanged.

No departure from the approved plan. `llms.txt` and the index needed no regeneration diff (index is untracked).
