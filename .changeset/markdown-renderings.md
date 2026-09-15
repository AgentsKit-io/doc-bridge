---
'@agentskit/doc-bridge': minor
---

Render the canonical artifacts as Markdown people can read, from templates rather than string
concatenation, and close the loop between what Doc Bridge writes and what it reads.

`ak-docs render <template> [--data <artifact>] [--output <path>]` ships five templates: `llms.txt`,
replacing the concatenation in the index builder byte for byte; `area`, one page per code area
with its purpose, modules, documents, related areas, checks and open findings; `ownership`, one
sidecar per ownership record; `change-digest`, the entities and documents whose content hash
moved since the last scan and the documents that should have moved with them; and
`overlay-review`, the pending agent proposals with their evidence links, with an explicit empty
state when no overlay exists. A project replaces any of them under `render.templates` without a
code change; `--print-template` prints the bundled source to start from.

Templates are `knap` 0.5 templates: parsed to an AST, interpreted without `eval`, and fed only
the variables Doc Bridge computes. The index pipeline is synchronous and knap's renderer is not,
so the AST is walked by a synchronous evaluator of Doc Bridge's own; a test renders every bundled
template through knap's engine as well and holds the two to identical bytes. Every bundled
template has a golden file, and rendering never calls an agent or reads the Registry.

Every generated Markdown region carries `<!-- doc-bridge:generated hash=… -->`. The Markdown
analyzer already skips mentions inside one; the documentation audit now recomputes the hash and
reports a region a person edited by hand as `GENERATED_REGION_EDITED` under
`generated-freshness`, so a regeneration never silently discards the edit. `llms.txt` carries no
marker and its bytes are unchanged for its existing consumers.
