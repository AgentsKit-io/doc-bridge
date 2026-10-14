---
title: Publication gate
description: Stop ak-docs index from publishing llms.txt and the index while documentation still cites code that changed.
---

# Publication gate

By default, reference findings are advisory: `ak-docs diff` reports them and exits 0. If you
want agents to never receive context that cites removed or changed code, turn on the
`reference-findings` gate. While findings are pending, `ak-docs index` refuses to write
`llms.txt`, the index and the capabilities file.

The gate is off unless you turn it on, and no preset selects it. The decision is recorded in
[ADR 0025](../adr/0025-opt-in-publication-gate.md).

## How it works

1. You take a **base snapshot**, normally of the target branch at the revision a change starts
   from.
2. The gate discovers the **head** (your local working tree), diffs it against the base and counts
   the pending `BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE` and `CHANGED_REFERENCE` findings.
3. While the count is above zero, the gate fails, and so does `ak-docs index`.

The Action's `fail-on-findings` uses the same selection and the same diff, over a different head:
it diffs the committed head revision, while the gate diffs your working tree, uncommitted edits
included. On the same tree the two counts agree. They differ when the tree is not the committed
head: a documentation fix you saved but did not commit clears the gate locally, and the advisory
still counts the finding until the fix is committed and pushed.

The gate **fails closed**. It fails with a message, and never passes in silence, when:

- no base is configured, the base file cannot be read, or it is not a discovery snapshot;
- the base has no document entities or no citation relations, so nothing could be found against it;
- the base or the head analysis was cut short by a resource limit (a `limits:*` coverage entry
  that is `partial` or `not-analyzed`), which could hide findings;
- the base has a different project identity, `configurationHash` or `analyzerVersions` than the
  head (the message names which). Snapshot the base again with the same configuration and
  doc-bridge version;
- the diff cannot run.

The underlying error text, which can name local paths, goes to stderr only.

## End-to-end example

Start from a repository where `docs/guide.md` says ``Use `removed`.`` and `api.ts` exports
`removed`.

### 1. Snapshot the base

From a clean checkout of the base revision, write the snapshot outside the checkout:

```bash
ak-docs action snapshot --revision "$(git rev-parse HEAD)" --root . --output ../artifacts/base-snapshot.json
```

`action snapshot` discovers under the service profile. The gate notices and discovers your
working tree with the same configuration selection, which leaves out gates, so turning the gate
on later does not invalidate the base.

`ak-docs discover --json > ../artifacts/base-snapshot.json` also works when you do not need
exact-revision provenance, but its `configurationHash` covers the whole configuration, gates
included: take it after step 2, with the configuration the head uses, or the gate fails closed.

The snapshot's project identity is the root `package.json` name, or else the checkout directory
name. When you snapshot the base in a separate checkout directory (another clone, a
`git worktree`, a CI path), the root `package.json` must name the project. Otherwise the two
directory names differ and the gate fails closed with "different project identities".

### 2. Turn the gate on

```json
{
  "schemaVersion": 1,
  "corpus": { "agent": { "root": "docs" } },
  "gates": {
    "preset": "minimal",
    "include": ["reference-findings"],
    "referenceFindings": { "base": "../artifacts/base-snapshot.json" }
  }
}
```

A relative `base` resolves against the project root.

### 3. Change the code and try to publish

Rename the export in `api.ts` to `replacement`, then:

```bash
ak-docs index
```

```text
Publication blocked: 1 pending reference finding(s) since base 3f2c….
  BROKEN_REFERENCE docs/guide.md:3 → removed
Fix the cited documentation, or publish anyway with ak-docs index --allow-pending-findings.
Nothing was written: the index and llms.txt stay as they were.
```

The command exits 1, and `llms.txt` and `.doc-bridge/` keep the bytes they had before.
`ak-docs gate run reference-findings` prints the same lines on stderr. Its JSON output has
`pendingCount`, `baseRevision` and each finding in full: `code`, `document`, `line`, `target`
and the complete `diagnostic`.

### 4. Fix the documentation and publish

Update `docs/guide.md` to cite `replacement`:

```bash
ak-docs gate run reference-findings   # exits 0
ak-docs index                         # writes the index, llms.txt and capabilities
```

### 5. Or publish anyway, on the record

When you have to publish before the documentation is fixed:

```bash
ak-docs index --allow-pending-findings
```

The index and `.doc-bridge/capabilities.json` then carry:

```json
{
  "publication": {
    "pendingReferenceFindings": {
      "override": "allow-pending-findings",
      "pendingCount": 1,
      "baseRevision": "3f2c…",
      "reason": "pending"
    }
  }
}
```

`reason` is a code, never free text: `pending` (findings are pending), `no-base`,
`base-unreadable`, `base-invalid` or `diff-unavailable` (the gate could not count; `pendingCount`
is then absent). The detailed error stays on stderr.

The override applies to that one run. The next `ak-docs index` without the flag is blocked
again, and the next normal publication drops the record. `publication` is outside the content
hash, so `index-freshness` is not affected.

An index that carries `publication` is rejected by doc-bridge releases older than the gate,
because the index schema is strict. Upgrade those readers before you publish with the override.

## Bounded runs

`ak-docs index --progress` and `ak-docs index --max-duration <ms>` run the gate inside the
bounded operation: Ctrl-C or the time limit stops the gate's discovery and diff, the command
exits 2 and nothing is written. Plain `ak-docs index` is synchronous and not bounded.

## MCP

`ak-docs mcp` serves the index that was already published. It starts serving first; then, when
the gate is on, it runs the gate and prints a warning on stderr if the gate fails. It never
refuses to start. The check is a full discovery and diff, so the server is busy while it runs.
The `gate.status` MCP tool runs the selected gates, this one included, at the same cost on every
call.

## Other commands that run the gate

Once selected, the gate runs wherever the selected gates run, each time paying a full discovery
and diff:

- `ak-docs gate run` and `ak-docs doctor` report it with the other gates.
- `ak-docs fix apply` verifies every selected gate after writing a remediation and rolls the
  edit back when one fails. While any other reference finding is still pending, applying a
  single fix is rolled back too: fix all pending findings together, or apply with the gate
  removed through `gates.exclude` and run the gate afterwards.

## CI

With the gate selected, `ak-docs action index` runs it like any other gate, so the Action
**fails until the job provides the base snapshot at the configured path**. Create it in the
workflow from the PR base revision before the Action step. With
`"referenceFindings": { "base": "../doc-bridge-base/base-snapshot.json" }` in the configuration:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      fetch-depth: 0
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Snapshot the PR base for the publication gate
    env:
      BASE_SHA: ${{ github.event.pull_request.base.sha }}
    run: |
      git worktree add --detach "$RUNNER_TEMP/doc-bridge-base-checkout" "$BASE_SHA"
      npx --yes --package @agentskit/doc-bridge@2 ak-docs action snapshot \
        --revision "$BASE_SHA" \
        --root "$RUNNER_TEMP/doc-bridge-base-checkout" \
        --output "$GITHUB_WORKSPACE/../doc-bridge-base/base-snapshot.json"
  - uses: AgentsKit-io/doc-bridge@<release> # the Action step that runs the gates
```

The relative `base` resolves against the project root, so the snapshot lands where the gate
reads it. The base checkout is a separate directory, so the root `package.json` must name the
project (see step 1). Use the same doc-bridge version for the snapshot as the Action runs, or the
gate fails closed on `analyzerVersions`. When a pull request changes the configuration the
snapshot depends on, the gate also fails closed on `configurationHash`: snapshot the base revision
again or land the configuration change first.

## Gate or `fail-on-findings`?

| | `reference-findings` gate | Action `fail-on-findings` |
| --- | --- | --- |
| Where it is set | Repository configuration | The workflow that calls the Action |
| What it stops | `ak-docs index` publishing; fails `gate run`, `doctor` and the Action gate step | Fails the CI step |
| Count | Pending reference findings in the local working tree | Same selection and diff, on the committed head |
| Override | `ak-docs index --allow-pending-findings`, recorded in the index | Remove the input |

You can use either one, both, or neither.

## Related

- [Gate and CI](./gate-ci.md)
- [Action advisory](./action-advisory.md)
- [Diff and findings](./diff-and-findings.md)
- [CLI: publication gate](../spec/cli.md#publication-gate)
- [Config: `reference-findings`](../spec/config-v1.md#reference-findings-opt-in-publication-gate)
