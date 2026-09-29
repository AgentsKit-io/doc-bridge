---
"@agentskit/doc-bridge": patch
---

Use `@agentskit/cross-platform` for process spawning, process-tree termination, path separators, line splitting and frontmatter detection. Registry agent and study CLIs that are `.cmd` shims now start on Windows without a shell, timed-out children no longer leave orphaned grandchildren on Windows, and the `okf-type` and `docs-style` gates read CRLF frontmatter. `pnpm check:cross-platform` guards against new portability regressions with a ratchet baseline.
