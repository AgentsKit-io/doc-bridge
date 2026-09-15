---
title: Study publication gate v1
description: Reviewable gates for publishing anonymized Doc Bridge efficiency measurements.
---

# Study publication gate v1

This gate prevents a smaller context payload, a provider-token measurement,
and a correct task result from being presented as the same claim.

## Required evidence

Before publishing a study result, all of the following must be present:

1. A versioned protocol, task suite, run plan, ledger, and result with content
   hashes.
2. A current `ak-verify` run whose source revision and configuration match the
   artifacts.
3. A privacy scan with zero forbidden matches.
4. Explicit classification of completed, partial, failed, blocked, and missing
   observations.
5. Separate values for context payload, provider-token usage, latency, and
   tokens-to-correct-action. Missing correctness evidence remains missing.
6. A human publication decision recorded by the tracking workflow.

## Reproduction

```bash
node bin/ak-docs.js study metrics docs/study/phase4-public-pilot-ledger-v1.json --json
node scripts/phase4-public-pilot-check.mjs
node scripts/study-privacy-gate.mjs docs/study
```

The first command exposes the machine-readable metric contract. The second
checks the pilot's hashes, bindings, scope, and arithmetic. The third scans
publication-bound artifacts without printing matched secret values.

## Claim boundaries

- `context payload reduction` is not provider-token reduction.
- `provider-token reduction` is not a currency saving unless configured pricing
  and provider usage are both available.
- `tokens-to-correct-action` is `null` when semantic success is not established.
- A bounded pilot is not evidence of enterprise-wide generalization.
- Publication requires human review even when every deterministic check passes.
