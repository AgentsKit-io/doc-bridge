---
"@agentskit/doc-bridge": patch
---

Stop bare lowercase words such as `main` in prose from resolving to a script's exported `main()`: an entrypoint script is only cited by a bare word when the same citation region also cites its path or package, so a second script exporting `main` no longer produces `AMBIGUOUS_REFERENCE` findings for a branch name.
