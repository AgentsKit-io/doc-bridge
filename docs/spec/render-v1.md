---
title: Render v1
description: The canonical artifacts rendered as Markdown people can read, from templates a project can replace.
---

# Render v1

Doc Bridge writes JSON for agents and HTML for browsing. `ak-docs render` writes the Markdown for
people: the same artifacts, through templates rather than string concatenation, so a project can
change the house style without a code change and every rendering is a function of its inputs.

```bash
ak-docs render llms.txt
ak-docs render area --output docs/areas
ak-docs render ownership --output docs/agent-corpus/generated
ak-docs render change-digest --data .doc-bridge/previous-snapshot.json
ak-docs render overlay-review --output review.md
ak-docs render area --print-template > templates/area.md
```

Rendering never calls an agent and never reads the Registry. Its inputs are the index, built in
memory from the working tree or read from the artifact `--data` names, the workflow's last
reconciliation report and snapshot, and an overlay file. Lists are sorted, nothing carries a
timestamp, and equal inputs render to equal bytes — every bundled template has a golden file, and
a test renders the same data twice.

## Templates

| Name | Renders | `--data` |
| --- | --- | --- |
| `llms.txt` | the curated reading order for agents, exactly as `ak-docs index` writes it | a `DocBridgeIndex` |
| `area` | one page per code area: purpose, modules, documents, related areas, checks, open findings | a `DocBridgeIndex` |
| `ownership` | one sidecar per ownership record: start page, what to read, edit roots, checks, related areas | a `DocBridgeIndex` |
| `change-digest` | entities and documents whose content hash moved since the last scan, and the documents that should have moved with them | the previous snapshot |
| `overlay-review` | pending agent proposals with their evidence links, for a human to judge | an enrichment overlay |

Without `--output`, the pages go to standard output; `--json` wraps them as `{ template, source,
pages: [{ path, content }] }`. With `--output`, a single page is written to that path and a
multi-page template under it as a directory; the command prints what it wrote.

Templates use [knap](https://github.com/obsidianmd/knap) syntax: `{{ variable }}`, `{% if %}`,
`{% for item in list %}`, and knap's standard filters. They parse to an abstract syntax tree and
are interpreted without `eval`; the application computes every variable before rendering, and a
template cannot call anything. knap renders asynchronously and the index pipeline is synchronous,
so Doc Bridge walks knap's AST with a synchronous evaluator of its own; a test renders every
bundled template through knap's engine as well and holds the two to byte-identical output.

## Overriding a template

```json
{
  "render": {
    "templates": {
      "area": "templates/area.md"
    }
  }
}
```

The path is relative to the project root. `ak-docs render <name> --print-template` prints the
bundled template to start from, and the variables each template sees are the exported view types
(`AreaPageView`, `OwnershipPageView`, `ChangeDigestView`, `OverlayReviewView`, `LlmsTxtVariables`).
An override replaces the bundled template entirely and is compiled by the same engine, so one that
does not parse fails before anything is written. The `llms.txt` override is also what
`ak-docs index` writes and what the documentation-standard profile re-renders to check freshness:
the two always agree.

## Generated regions

Every Markdown page carries a marker around what the generator owns:

```markdown
<!-- doc-bridge:generated hash=2dc9b98ec7b986b0 -->
…
<!-- /doc-bridge:generated -->
```

A template places the markers with `{{ region.open }}` and `{{ region.close }}`; a template that
prints neither is wrapped whole. The hash is the first sixteen hex characters of the SHA-256 of
the lines between the markers, with line endings normalised, so an editor converting a file to
CRLF has not changed what the generator wrote.

The marker is what closes the loop with the rest of the pipeline. The Markdown analyzer skips
mentions and links inside a generated region (`docs/spec/markdown-analyzer-v1.md`), so Doc Bridge
never reads its own output back in as evidence about the repository. The documentation audit
recomputes the hash of every region and reports one that no longer matches its marker as
`GENERATED_REGION_EDITED` under `generated-freshness`, with the region's lines as evidence: a
manual edit inside a region is a finding, never something a regeneration silently discards. Text
outside the markers is a person's and is left alone.

`llms.txt` carries no marker. It is a whole-file artifact with consumers of its own — the
federation retriever and the freshness gate — and its bytes are unchanged from before.

## The change digest

The digest compares two discovery snapshots by the content hash each file-backed entity carries
(`docs/spec/incremental-scan-v1.md`): an entity in both with a different hash is *changed*, one
only in the current snapshot is *added*, one only in the previous is *removed*. An entity without
a hash — an external package, an area — has nothing to move and is not listed.

"Documentation to review" answers which documents this change should have touched: every document
that covers, mentions, links to or references a symbol of something that moved, and did not move
itself. A document that changed alongside its subject is in *changed*, not there.

The previous snapshot is the one `--data` names, otherwise the last `ak-docs scan` (the
workflow's `normalize` output under `.doc-bridge/workflow`). The current one is a cold scan of the
working tree. Rendering does not move the baseline — only a scan does — so the digest can be
rendered as many times as a review needs. With no previous snapshot the command says so and
exits 2.

## The overlay review page

The page reads an enrichment overlay's `pending` proposals — id, kind, entity, reason, confidence
and evidence locations — and renders each with links of the form `path#L10-L12`. It is
deliberately loose about the overlay's shape, which the enrichment workstream owns. With no
overlay it renders an explicit empty state rather than failing; `.doc-bridge/enrich/overlay.json`
is read when it exists, and `--data` names any other file.

## Boundaries

Nothing under `src/render` imports anything under `src/agents`; a test walks the imports.
Rendering works with the Registry disabled, because it never consults it.
