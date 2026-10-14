---
title: Opt-in publication gate for pending reference findings
status: accepted
date: 2026-10-14
owner: maintainers
lifecycle: active
sourceOfTruth: src/gates/reference-findings.ts
validationPath: pnpm vitest run tests/publication-gate.test.ts tests/publication-gate-mcp.test.ts tests/cli-controls.test.ts --maxWorkers=2
---

# Opt-in publication gate for pending reference findings

Amends [ADR 0015](0015-advisory-action-and-ci-built-index.md).

## Context

ADR 0015 keeps the advisory separate from blocking gates. It rejects turning advisory findings into
an implicit blocking gate, because that changes configured policy without consent. Since then no
gate has looked at findings: `ak-docs diff` exits 0 with findings present, and only the Action's
`fail-on-findings` input turns the advisory's `pendingCount` into a failed step.

That leaves one gap. `ak-docs index` writes `llms.txt`, the index and the capabilities file, which
are the context agents read. It writes them even when the documentation still cites code that the
change removed or changed. A maintainer who wants agents to never receive that context has no way
to say so.

## Decision

Add a `reference-findings` gate that a maintainer turns on explicitly. Blocking is a choice the
maintainer makes in configuration. Doc Bridge never infers it.

- **Default off.** No preset selects the gate. It runs only when `gates.include` names it, and
  `gates.exclude` still removes it. A `gates.referenceFindings` block alone enables nothing.
  Repositories that do not opt in see no change in behaviour.
- **Same selection and same diff as `fail-on-findings`, over the local working tree.** The gate
  runs the snapshot diff the advisory runs against `gates.referenceFindings.base` and keeps the
  same findings (`BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE`, `CHANGED_REFERENCE`, minus findings
  whose citing documentation was updated in the same change). It fails while that count is above
  zero. The advisory and the gate share one function for this selection. The inputs differ,
  though: the advisory diffs a committed head revision captured under the service profile, while
  the gate discovers the local working tree, uncommitted edits included. When a base comes from
  `ak-docs action snapshot`, the gate discovers the head with the same service configuration
  selection, so the two configuration hashes match; otherwise it uses the project configuration,
  like `ak-docs discover`. The counts therefore agree for the same tree, and can differ when the
  tree is not the committed head. For example, a documentation fix that is saved but not
  committed clears the gate locally, while the advisory for the pushed head still counts the
  finding until the fix is committed and pushed.
- **Base is a snapshot file.** `base` names a discovery snapshot (`ak-docs action snapshot`, or the
  `snapshot` of `ak-docs discover --json`). We did not accept a Git reference: it would make the
  gate check out and analyse another revision. `action snapshot` already does that job, with
  exact-revision provenance.
- **Fails closed.** A selected gate fails, with a message saying what to fix, when no base is
  configured, the base cannot be read, the file is not a discovery snapshot, or the diff cannot
  run. It also fails when the diff could run but could not be trusted: a base with no document
  entities or no citation relations (nothing could ever be found against it), a base or head whose
  coverage reports a `limits:*` entry as `partial` or `not-analyzed` (a limit cut the analysis
  short, which could hide findings), or a base whose project identity, `configurationHash` or
  `analyzerVersions` differ from the head (the message names which). It never passes in silence.
- **`ak-docs index` respects the gate.** When the gate is selected and fails, `index` writes
  nothing (no index, no `llms.txt`, no capabilities file), exits 1 and prints the findings, one line
  each: code, document, line and target. `ak-docs gate run` prints the same short list, and its JSON
  output carries every finding in full. `index --watch` skips each rebuild while the gate fails.
- **Explicit override.** `ak-docs index --allow-pending-findings` publishes anyway. The index then
  records the override in `publication.pendingReferenceFindings`: the pending count when it was
  counted, the base revision, and a reason code (`no-base`, `base-unreadable`, `base-invalid`,
  `diff-unavailable` or `pending`). The capabilities file records the same thing. The record holds
  no free text: error messages can name local paths, and a JSON parse error can quote the base
  file's bytes, so that text goes to stderr only and never into the index, the capabilities file
  or an Action report. This provenance is outside `contentHash`, so `index-freshness` still
  compares content only. The override does not carry over to later runs: the next `index` without
  the flag is blocked again, and the next unblocked publication drops the record.
- **Bounded with the index operation.** `ak-docs index --progress` and `--max-duration` run the
  gate inside the bounded operation: the head discovery and the diff share its `AbortSignal` and
  time budget, so Ctrl-C or the time limit stops the gate like any other stage and nothing is
  written. Plain `ak-docs index` runs synchronously, as before, and is not bounded.
- **MCP warns, never blocks.** `ak-docs mcp` reads the index already published. It starts serving
  first, then runs the gate on a later turn and warns on stderr when the gate is selected and
  failing.

### Relation to `fail-on-findings`

`fail-on-findings` stays as it is. It is an Action input that fails a CI step on the advisory's
`pendingCount`, and it never stops anything from being published. The gate is a repository
policy that every surface running gates honours (`gate run`, `doctor`, the Action's gate step), and
`index` checks it before publishing. A repository can use either, both, or neither. Both apply
one selection to the same diff, so they agree whenever they see the same tree; the gate sees the
local working tree and the advisory the committed head.

## Alternatives considered

- **Count findings in an existing gate, or add the gate to a preset.** This is the implicit
  blocking that ADR 0015 rejected.
- **Pass when no base is configured.** A misconfigured gate would look like a passing one.
- **Block `ak-docs mcp`.** The server only reads what was already published. Refusing to start
  would take context away from agents without stopping a single bad publication.
- **Make the override persistent.** One forced publication would turn the gate off quietly.

## Consequences

- The gate does a full local discovery and diff, which costs about as much as `ak-docs diff`.
  Every surface that runs the selected gates pays it: `gate run`, `doctor`, the MCP `gate.status`
  tool, the post-apply verification of `ak-docs fix apply`, and the MCP start-up check (which
  runs after the server starts, but still occupies the process while it runs). Repositories that
  do not select the gate pay nothing.
- The project identity of a snapshot is the root `package.json` name, or else the checkout
  directory name. A base taken in a separate checkout directory (for example a CI worktree of the
  base revision) therefore matches the head only when the root `package.json` names the project;
  otherwise the gate fails closed with "different project identities".
- A base discovered with a different configuration fails closed. A base from `ak-docs discover
  --json` must be taken with the head's whole configuration, gates included; a base from `ak-docs
  action snapshot` must share the service configuration selection, which leaves out gates.
- Readers are strict: the index schema rejects unknown fields. A doc-bridge release older than
  this ADR rejects an index that carries `publication`, so an index published with
  `--allow-pending-findings` cannot be read by those older readers until they upgrade. Indexes
  published without the override have no `publication` field and stay readable.
- With the gate selected, `ak-docs action index` fails until the CI job provides the base
  snapshot at the configured path; the [publication gate guide](../guides/publication-gate.md)
  has a recipe that snapshots the PR base revision in the workflow.
- `ak-docs action index --index-source ci-built` reports the gate like any other selected gate. Its
  ephemeral exports are unchanged by this ADR.
