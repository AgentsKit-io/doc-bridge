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
2. The gate discovers the **head** (your working tree), diffs it against the base and counts the
   pending `BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE` and `CHANGED_REFERENCE` findings. The
   Action's `fail-on-findings` uses the same count (`pendingCount`).
3. While the count is above zero, the gate fails, and so does `ak-docs index`.

The gate **fails closed**. With no base configured, a base file that is missing or is not a
snapshot, or a diff that cannot run, the gate fails with a message. It never passes in silence.

## End-to-end example

Start from a repository where `docs/guide.md` says ``Use `removed`.`` and `api.ts` exports
`removed`.

### 1. Snapshot the base

From a clean checkout of the base revision, write the snapshot outside the checkout:

```bash
ak-docs action snapshot --revision "$(git rev-parse HEAD)" --root . --output ../artifacts/base-snapshot.json
```

`ak-docs discover --json > ../artifacts/base-snapshot.json` also works when you do not need
exact-revision provenance.

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
      "reason": "1 pending reference finding(s) since base 3f2c…."
    }
  }
}
```

The override applies to that one run. The next `ak-docs index` without the flag is blocked
again, and the next normal publication drops the record. `publication` is outside the content
hash, so `index-freshness` is not affected.

## MCP

`ak-docs mcp` serves the index that was already published. When the gate is on and failing, the
server prints a warning on stderr at start and then serves as usual. It never refuses to start.

## Gate or `fail-on-findings`?

| | `reference-findings` gate | Action `fail-on-findings` |
| --- | --- | --- |
| Where it is set | Repository configuration | The workflow that calls the Action |
| What it stops | `ak-docs index` publishing; fails `gate run`, `doctor` and the Action gate step | Fails the CI step |
| Count | Pending reference findings | Same |
| Override | `ak-docs index --allow-pending-findings`, recorded in the index | Remove the input |

You can use either one, both, or neither.

## Related

- [Gate and CI](./gate-ci.md)
- [Action advisory](./action-advisory.md)
- [Diff and findings](./diff-and-findings.md)
- [CLI: publication gate](../spec/cli.md#publication-gate)
- [Config: `reference-findings`](../spec/config-v1.md#reference-findings-opt-in-publication-gate)
