---
title: Generated vault edit review
authority: human-approved scope
status: accepted
date: 2026-10-08
---

# Generated vault edit review

## Context

The vault manifest records exact note hashes and the exporter protects edited
owned notes from overwrite. Enrichment has a closed proposal union, persisted
human decisions and expiring entity bindings. None of its existing proposal kinds
can represent an arbitrary edit to a generated navigation note with source-region
evidence. ADR 0011 separates review presentation from source-change acceptance.

## Decision

Add a human-policy `vault-edit` proposal kind to the existing enrichment overlay.
Preserve the exact original and edited note text, both note hashes and source
regions from the original export. Regenerate the baseline and require its hash to
match the ownership manifest before creating proposals; edited frontmatter is not
authority. If a knowledge note has several source documents, create a separately
bound proposal for each. Report missing or stale bindings and added/deleted notes
without applying changes. Review of a proposal never writes source documents or
adds retrieval influence. Reuse the existing decision persistence and local draft
helper; the helper only writes a review draft and prints commands.

Knowledge entity notes are opt-in and use the additive export registry, existing
stable IDs and observed document/commit/fact evidence. Disabled export bytes stay
unchanged. Index and handoff serialization do not change.

## Alternatives considered

- Reuse summaries, aliases or gap flags: changes the meaning of those claims and
  cannot preserve an arbitrary before/after note edit.
- Trust edited source bindings or infer a source for navigation notes: permits
  edits to choose ungrounded targets.
- Apply source patches directly: crosses the existing human review boundary.

## Consequences

Older strict enrichment readers reject the new kind, so overlays containing it
require updated readers; existing proposal shapes remain unchanged. Arbitrary
note edits remain suggestions with all bound document regions, not inferred
patches. Source/configuration drift requires restoring a baseline or manual
review. The exact payload, limits and recovery boundary are specified in
[vault diff v1](../spec/vault-diff-v1.md). Acceptance exercises real export/diff,
multi-document bindings, stable replay/decisions, added/deleted/stale reports,
source preservation and the built CLI draft preview.
