---
title: Discovery coverage v1
description: Bounded deterministic coverage summaries in the existing strict snapshot schema.
---

# Discovery coverage v1

`DiscoverySnapshotV1.coverage` remains bounded to 1,000 `CoverageSchema` entries.
No fields are added to the strict version 1 snapshot, `DocBridgeIndexV1` or
`AgentHandoffV1`. Inputs at or below 1,000 entries retain their bytes and ordering.

Above that bound, entries are grouped by analyzer, analyzer version,
scope kind (before the first colon), status, original reason and path prefix.
The prefix is the first directory component of the first evidence path, falling
back to the path after the scope's first colon; root files use `.`. Scope is
`kind:prefix`, capped at 512 characters. Capability scopes without a colon retain
their original scope so downstream capability checks still work. Operational
`limits:` scopes, reuse provenance and already aggregated entries remain separate.

Each group's existing `reason` string contains JSON with:

- `aggregation: "coverage-v1"` identifying sampled coverage;
- `count`, the number of input entries represented;
- `evidenceOmitted`, the number of unique evidence records outside the sample;
- `detailHash`, a normalized SHA-256 digest of all canonically ordered input
  entries, including unsampled details;
- `reason`, the original reason when present and within the 1,024-character
  serialized limit, otherwise `reasonTruncated: true`.

The existing `evidence` array samples at most eight unique records, ordered by
canonical JSON using code-unit comparison. Group order uses the same comparison.
Counts include duplicates; evidence samples are deduplicated. Each group retains
its input status. Omitted evidence and reasons are explicitly reported; a sample
does not prove absence of other limitations. Digests make unsampled detail changes
invalidate semantic identity without exposing unbounded content.

If separate entries plus groups still exceed 1,000, keep 999 entries and append
a `repository` / `coverage-aggregation` entry with `partial` status. Its JSON
reason reports `aggregation`, `count`, `omittedGroups`, `detailHash` and a readable
truncation explanation. Retention orders reuse provenance first, then operational
limits, then canonical JSON. Counts for previously aggregated entries are retained
when further summaries are required. This final fallback bounds even repositories
with more than 1,000 distinct reasons or prefixes.

Aggregation never upgrades coverage status. It does not change acquisition,
entity, relation or retrieval limits. Reuse provenance remains outside semantic
identity; aggregated snapshots refuse incremental reuse because their evidence
samples cannot reconstruct per-file coverage. They are rescanned instead.
