---
title: Export a knowledge vault
description: Navigate generated repository notes alongside committed team knowledge.
---

# Export a knowledge vault

Keep human-authored knowledge in a committed folder and generated navigation in an
ignored folder. For example, add `.doc-bridge/` to `.gitignore` and configure:

```ts
export default {
  schemaVersion: 1,
  corpus: {
    agent: { root: 'docs/for-agents' },
    human: { plugin: 'obsidian', options: { root: 'docs/notes' } },
  },
  vault: {
    output: '.doc-bridge/vault',
    humanNotes: 'docs/notes',
  },
}
```

Write and commit Markdown under `docs/notes`. The opt-in discovery plugin indexes
its `[[wikilinks]]`, aliases and tags as team knowledge; export does not edit that
folder. To retain an existing documentation corpus, use a `corpus.human` array
with the existing adapter and the additional notes adapter.

```bash
ak-docs index
ak-docs vault export --text
```

Open the generated directory as a vault and start at `index.md`. Package, area and
document notes link to each other; document notes link back to source files.
`graph-signals.md` presents graph navigation signals and area suggestions. Equal
inputs produce equal bytes across repeated exports. Removed source documents
remove only unchanged generated notes owned by the manifest.

To customize presentation, put `{{ body }}` in a project-owned template, adjust
it using knap syntax, and set `vault.templates.document` to that file's relative
path. `note.id`, `note.aliases`, `note.tags` and `note.sources` are available;
required frontmatter is preserved outside the template.

Export refuses to overwrite edits to generated notes. Preserve edits for review
before regenerating; round-trip proposals are a separate capability. Prefer the
committed human-notes folder for durable new knowledge. Keep generated output out
of version control and do not copy it over the source corpus.

See the [export contract](../spec/vault-export-v1.md) for filenames, hashes,
containment and recovery limits.
