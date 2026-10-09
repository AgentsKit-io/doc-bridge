---
title: Vault diff contract v1
description: Deterministic generated-note edits as human-reviewed enrichment proposals.
---

# Vault diff v1

`ak-docs vault diff [--pr] [--config <path>] [--text|--json]` compares generated
Markdown notes with the exact SHA-256 hashes in the export manifest. It is local,
deterministic and requires no model or network. The service profile denies it.
Source documents and the configured human-notes folder are never written.

## Baseline and evidence

The current export is rendered in memory using the existing exporter, source
bindings and templates. A changed manifest-owned note is eligible only when the
regenerated original matches its manifest hash. Source/configuration drift is
reported in `unproposed`; the engine never trusts edited frontmatter as a source
binding. Restore the baseline or preserve the edit for manual review before
regenerating. Missing manifests and malformed manifests fail closed.

Each eligible edit becomes an enrichment proposal of kind `vault-edit` with human
policy, stored pending in the existing enrichment overlay. Its payload contains:

| Field | Meaning |
| --- | --- |
| `note` | Repository-relative generated note path |
| `originalHash`, `editedHash` | SHA-256 of exact UTF-8 note bytes |
| `original`, `edited` | Complete before/after note text, including frontmatter |
| `sourceRegions` | Original source bindings `{path, lineStart, lineEnd, hash}` |

Region coordinates are one-based inclusive lines; region hashes retain the
exporter's `sha256-normalized-v1` algorithm. The proposal envelope binds the
current source entity, target content hash and snapshot, with observed evidence.
Knowledge notes produce a separate proposal for each bound source document.
Each proposal cites that document's bound regions rather than guessing which region an arbitrary
navigation edit should replace. Note hashes use exact bytes, including line endings.

Proposal identity includes note path and both hashes. Repeating unchanged inputs
produces identical proposals and does not duplicate pending, accepted or rejected
entries. A different edit produces a different proposal. Existing overlay entries
and human decisions survive; an invalid overlay is never overwritten. Approval via
`ak-docs enrich approve` records acceptance of a suggestion only: `vault-edit`
has no retrieval effect and never applies source changes.

## Reported limitations

JSON output includes `proposals`, `added`, `deleted`, and `unproposed`. Added and
deleted generated notes are reported only. Navigation and commit-only notes lacking
a source document region are reported without proposals. Human notes are indexed
through their corpus adapter and are never scanned as generated-note edits.
Notes over 256 KiB, invalid UTF-8, and notes containing recognized secrets are
reported without storing their text. No fuzzy relocation or automatic remediation
is attempted. All existing export path, ignored-output and link protections apply.
Concurrent filesystem mutation is unsupported; keep the repository stable during
review. Overlay writes use the existing atomic single-file persistence path.

## Draft PR helper

`--pr` uses the memory-promotion draft helper in preview mode: it writes a local
ignored review draft and prints suggested git/gh commands. It never opens a PR,
pushes, commits, changes branches or writes source docs itself. Inspect the draft
and select an appropriate review artifact location before running those commands;
the default draft directory is ignored. No helper runs when there are no proposals.
