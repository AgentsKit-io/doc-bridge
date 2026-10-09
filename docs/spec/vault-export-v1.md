---
title: Vault export contract v1
description: Deterministic generated Markdown notes, source bindings and ownership.
---

# Vault export v1

`ak-docs vault export` discovers the current local repository and writes a Markdown
vault. It requires no network, model or API key. Export is a local filesystem
operation and is denied in the service profile. It does not mutate source documents,
human notes, discovery snapshots, indexes or handoffs.

## Configuration and boundaries

`vault.output` defaults to `.doc-bridge/vault`; `vault.humanNotes` defaults to
`docs/notes`. Both resolve within the project root. The output must be ignored by
Git (or the on-disk ignore rules outside Git), contain no tracked files, and be
disjoint from the human-notes folder. Export never adds ignore rules or creates the
human-notes folder. All path components, including template/source paths, reject
symlinks, dangling symlinks, hard-linked files and traversal. Files are written only under the output.
The project must not change the output directory concurrently with export.

Human notes are discovered only through `corpus.human`, not automatically through
`vault.humanNotes`. Configure the opt-in `obsidian` plugin with
`options.root` equal to the committed human-notes folder. See the
[vault guide](../guides/vault.md) and [discovery contract](./obsidian-markdown-v1.md).
Generated output stays excluded from discovery.

## Layout and identity

The flat output directory contains:

- `<sha256(entity-id)>.md` for each discovered package, area and document;
- `graph-signals.md`, containing existing canonicality, centrality, bounded import
  cycles and seeded area suggestions (suggestions remain hypotheses);
- `index.md`, the map of content, including discovery coverage and limitations;
- `.doc-bridge-vault.json`, the versioned ownership manifest.

Entity IDs are preserved. Hashed filenames avoid filename collisions, platform
restrictions and wikilink syntax injection from arbitrary names. Links between
exported entities use `[[filename-without-extension]]`. Other relation targets
retain their source IDs as text; export never invents missing notes or relations.
Incoming and outgoing relations retain their kind, direction and provenance.
Document notes link to source documents with relative Markdown links; source body
text is not copied. The vault must remain at its configured project location for
those links to resolve. Display titles are headings, not filename identities.

## Frontmatter and source binding

Required frontmatter is generated independently of the presentation template:

| Field | Meaning |
| --- | --- |
| `id` | Original stable entity ID, or `vault:index` / `vault:graph-signals` |
| `type` | `package`, `area`, `document`, `index`, or `graph-signals`; opt-in knowledge adds `decision`, `concept`, `change`, `symbol` and `module` |
| `sourcePath` | Entity source path, or null when absent; entity notes only |
| `sources` | File bindings from entity path and evidence; entity notes only |
| `aliases` | Sorted unique discovered aliases |
| `tags` | Sorted discovered string tags |

Each `sources` item contains project-relative `path`, `fileHash` and
`hashAlgorithm: sha256-exact-bytes-v1`. File hashes cover raw file bytes, including
line endings. Document bindings also include the existing Markdown analyzer's
`regions`: `{ lineStart, lineEnd, hash }` and
`regionHashAlgorithm: sha256-normalized-v1`. Regions retain analyzer line
coordinates and normalized text hashes; they are evidence for subsequent review,
not authorization to edit. Non-document files have an empty region list. Directory
entities have no file hash unless their evidence names a file. Export never
substitutes an empty-file hash for a directory or missing source.

The manifest is `{ schemaVersion: 1, files: { filename: sha256 } }`, where each hash
covers the entire generated note's exact UTF-8 bytes, including frontmatter.
It contains no timestamps, revisions or absolute paths. Equivalent discovery,
source bytes, templates and configuration produce byte-identical notes and manifest.
File/region evidence is separate from semantic graph identity (ADR 0010).

## Templates and additive note types

`vault.templates` maps note-type names to project-relative knap template files.
Each template receives `note` (frontmatter variables) and `body` (the default
Markdown presentation). The default template for every type is `{{ body }}`.
Overrides cannot remove the required frontmatter. Templates are compiled through
the renderer's existing knap parser, validators and synchronous evaluator before
any output writes. Invalid templates fail the export.

The internal `VAULT_NOTE_TYPES` registry selects entity kinds and bundled
presentations. When `index.knowledgeEntities.enabled` is true, export uses the existing bounded
knowledge extractor to add decision, concept and change notes. Their IDs,
source-region/commit evidence and links are preserved. Symbol/module notes provide
wikilink targets for observed facts; unresolved targets retain text IDs. Knowledge
notes include an additive `evidence` frontmatter field from the entity contract.
Local first-parent commit SHAs are evidence locators, not remote links. Templates
may override the additive note types. When knowledge entities are disabled,
existing export bytes are unchanged; index and handoff schemas are untouched.
Round-trip review follows [vault diff v1](./vault-diff-v1.md).

## Ownership and errors

Export validates the manifest and all existing owned files before writing. Only
unchanged manifest-owned notes may be overwritten or removed. Edited owned notes
fail with an actionable diagnostic; retain their edits for review. Existing files
without ownership are preserved; a collision with a requested generated filename
fails. Stale unchanged owned notes are removed, including when their source was
removed. Missing owned notes may be regenerated. Unknown files and directories
are never deleted. Malformed manifests, nonignored output and unsafe paths fail
before writes.

Filesystem failures during writing can leave a partial export. This version has
no multi-file transaction: preserve the directory and manifest for recovery;
do not treat a partial run as a successful export. No source files are written.
