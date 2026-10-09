---
title: Key-free region remediation
description: Preview an optional L2 correction with scripted provider responses.
owner: maintainers
lifecycle: active
sourceOfTruth: src/fixes/llm-cli.ts
validationPath: pnpm vitest run tests/llm-remediation.test.ts --maxWorkers=2
---

# Key-free region remediation

Use an installed `ak-docs` with a configured fixture repository. Save a discovery
snapshot before removing or changing a cited API, then keep the resulting base
snapshot outside the scanned repository. Only findings routed to L2 are considered.

## Example

Before the change, a document says `Previously use first` with `first` in backticks.
The module exports `first` and `second`. After removing `first`, save this as
`responses.json` outside the fixture:

```json
[{ "replacement": "Use `second`." }]
```

```sh
ak-docs fix --llm --base base.json --responses responses.json --output .doc-bridge/l2.json --pr
```

The exact cited line is replaced in memory. A passing region appears as a
RemediationV1 diff for review; the source stays untouched. A response such as
`Still use first` with `first` in backticks is rejected as
`ORIGINAL_FINDING_REMAINS`. Removing the document's only title while fixing the
citation is rejected as `NEW_FINDING`. Tests exercise both failures and acceptance
through real discovery, delta, reconciliation and audit.

## Planning and review

Use `--dry-run` to inspect request plans without provider access. Adjust
`--max-findings` and `--max-tokens` to bound the run. The scripted provider reads no
keys; omit `--responses` only when you intend to use configured intelligence.

`--pr` writes a preview draft and prints review commands. Inspect every diff and
revalidate combined edits before using the region library's authenticated review
and apply functions. A passing deterministic check does not prove semantic intent
and does not resolve the original finding.

See the [contract](../spec/llm-remediation-v1.md) for limits and rejection reasons.
