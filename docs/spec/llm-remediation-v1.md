---
title: Optional L2 remediation v1
description: Bounded optional region proposals accepted only after deterministic rechecking.
owner: maintainers
lifecycle: active
sourceOfTruth: src/fixes/llm.ts
validationPath: pnpm vitest run tests/llm-remediation.test.ts --maxWorkers=2
---

# Optional L2 remediation v1

`ak-docs fix --llm --base <snapshot.json>` is an explicit opt-in. Ordinary fixes,
indexing, queries, gates and handoffs never load this separate optional entry.
`@agentskit/doc-bridge/remediation` exports `proposeL2Remediations`,
`regionProviderFromAdapter` and `scriptedRegionProvider` for trusted callers.
No FindingV1, RemediationV1, DocBridgeIndexV1 or AgentHandoffV1 schema changes.

## Acquisition and requests

The caller supplies a validated prior discovery snapshot. The current bounded
repository inventory is captured once, then discovery and delta policy run on
that exact in-memory partition. Only `routed-to-L2` findings are candidates;
excluded, generated, pending-version and insufficient-evidence findings never
reach the provider. Changed references remain uncertainty, not proven removals.

Each prompt contains the finding, its evidence, current relevant entities/facts
and the exact current cited line region. UTF-8 byte offsets bind that region;
responses cannot choose a path or range. Document/evidence content is untrusted
data. Output must be exactly `{ "replacement": "..." }` without extra fields.
One proposal covers one cited region; remaining citations must also clear before
it can pass. Missing regions and oversized prompts fail closed without truncating
the evidence into a misleading request.

`--max-findings` defaults to 5 (1–100). `--max-tokens` defaults to 8192
(256–32768) **per request**, split equally between input and output. UTF-8 bytes
conservatively upper-bound input tokens, and both replacement bytes and adapter
response bytes are capped by the output reservation. At most one request per
selected finding; no retries or tool calls. The run has a 60-second cancellation
signal; adapters must honor abort. Programmatic callers can provide a signal.

## Provider boundary

The ecosystem `@agentskit/adapters` optional peer supplies the existing Adapter
contract. There is no `/runtime` export in the supported installed peer, so no
such dependency is required. The CLI reuses configured intelligence resolution
only on explicit non-dry-run invocation; its existing key/embedder requirements
apply. Provider objects are caller-owned programmatically. A response cannot
execute tools, shell commands or filesystem writes through the wrapper.

`--responses <script.json>` instead uses a deterministic JSON array of responses,
consumed in order with failure on exhaustion. It never loads provider peers or
reads API keys. `--dry-run` constructs bounded plans without calling any provider.

## Acceptance rule

For each response independently, validate a region-scoped RemediationV1 with the
existing containment, generated-region, exact-byte and evidence protections.
Apply the replacement only to a copy of the captured inventory. Re-run real
discovery, delta policy, declarations, reconciliation and documentation audit.
Accept only when the original ID **and** category/document/assertion locator are
absent, no new deterministic finding appears in the touched document, and the
recheck has no applicable resource/coverage failure. Existing findings compare
by code, status, severity, message, entities and evidence paths, ignoring relocated line numbers
and file hashes. No model judges its own patch.

This is deterministic evidence, not semantic proof that a rewrite preserves the
claim. In particular, deleting a citation can clear a finding, and a corrected
changed-signature citation can remain flagged by the existing delta engine.
Human review still decides correctness; acceptance never resolves a finding.

## Output and review

JSON output includes `remediations` (only passing RemediationV1 records),
`rejected` (`findingId`, machine-readable `reason`, and a rejected RemediationV1
when region validation produced one), and `planned` (finding ID, prompt byte count,
output token reservation). Reasons include `ORIGINAL_FINDING_REMAINS`,
`NEW_FINDING`, `INVALID_RESPONSE`, `NO_CHANGE`, `PROMPT_BUDGET`, `OUTPUT_BUDGET`,
`INSUFFICIENT_EVIDENCE`, `REGION_UNAVAILABLE`, `REGION_VALIDATION_FAILED`,
`VERIFICATION_INCOMPLETE`, `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILED`, and `ABORTED`.
Raw provider error messages are not emitted. `--output <file>` persists the records.

`--pr` reuses the memory promotion draft helper in preview mode: writes a review
draft and returns git/review commands without pushing, creating a PR or applying
documentation edits. It presents independently checked diffs; combining proposals
requires fresh validation. Ordinary application still requires exact human approval.

## Example

```sh
ak-docs fix --llm --base base.json --responses responses.json --max-findings 2 --max-tokens 8192 --output .doc-bridge/l2.json --pr
ak-docs fix --llm --base base.json --dry-run
```

See the [key-free guide](../guides/llm-remediation.md) and
[acceptance ADR](../adr/0022-l2-remediation-acceptance.md).
