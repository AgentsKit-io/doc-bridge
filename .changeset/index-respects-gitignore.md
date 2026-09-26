---
"@agentskit/doc-bridge": minor
---

Repository scans now respect ignore rules. `ak-docs index`, `doctor`, `scan`/`check`, gates, and link-fix proposals skip every path the repository ignores — via `git ls-files --cached --others --exclude-standard` inside a Git work tree (nested `.gitignore`, `.git/info/exclude`, and global excludes included; tracked files are kept), or the on-disk `.gitignore` files outside Git — in addition to the built-in safety excludes. Build output such as `.next/`, `.source/`, generated API pages, or `next-env.d.ts` no longer enters a committed index, so `index-freshness` and `index-reproducible` agree across clean checkouts. Agent-memory ingestion still reads gitignored memory directories.
