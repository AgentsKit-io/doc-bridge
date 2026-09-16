---
'@agentskit/doc-bridge': patch
---

Stop writing an index that Doc Bridge's own reader refuses.

`knowledge[]` and `projection.entries` in `doc-bridge-index-v1` describe the same entries, and
their bounds disagreed: 10 000 against 50 000. A monorepo that projects 10 909 entries therefore
got an index `ak-docs index` reported building successfully and every reader rejected — `doctor`,
`search` and the MCP server all failed with a schema dump naming an array, on a repository whose
index was sitting on disk.

Both bounds are now one exported constant, `RETRIEVAL_MAX_ENTRIES`, shared by the Zod schema, the
published JSON Schema and the builder, and a test asserts the two agree rather than asserting the
number. The builder checks the bound before it writes, so a corpus that genuinely exceeds it is
reported where the count and the remedy are both known — narrow `corpus.*.include`, or split the
repository across more than one index — instead of becoming an unreadable file.
