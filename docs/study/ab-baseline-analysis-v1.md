# A/B baseline analysis — 2026-08-31

This is the first paired baseline for `repository-only` versus `deterministic-doc-bridge`. It uses 24 anonymized task definitions, two pinned Codex CLI models, and 48 observations per arm. The result is directional and intentionally not an enterprise or causal claim.

## Result

The deterministic Doc Bridge arm completed 40/48 executions (83.3%) versus 38/48 (79.2%) for repository-only. Its completion p95 interval is 70.4–91.3%, while repository-only is 65.7–88.3%. Task success was 5/48 (10.4%) versus 4/47 (8.5%) where an outcome was recorded; this difference is inconclusive at this sample size.

On paired observations, deterministic Doc Bridge used 5,762 fewer provider tokens on average (−2.29%, 47 pairs with token data). Its latency p95 was 3,150 ms lower (94,339 ms versus 97,489 ms). Evidence quality was higher (27.1% versus 23.4%), while evidence citation rate was slightly lower (91.7% versus 93.8%).

The result is `inconclusive`: the signal is encouraging but small, one repository-only observation lacks provider token data, one repository-only observation timed out, and provider cost was not emitted. The next round must add cost attribution and independent outcome adjudication before using the study as a market claim.

## Provenance

- Plan: `ab-baseline-recovery-plan-v1.json`, hash `42d96e1152014318eadd2e0790259efc0ea96b138a1dcc4ac60c182ec357215f`
- Run: `phase-8-ab-baseline-recovery-01`
- Ledger hash: `9bf49dcee8071a4b5bfc7c515d2ee3d53c5f02344ffcf8bdeb7a412ad3f4e678`
- Metrics report hash: `a04b7b1a3081d1011bcd99548d9929ebb96de75fd217823f498112a586533428`
- Structured result: [ab-baseline-result-v1.json](./ab-baseline-result-v1.json)

The failed first attempt remains in the immutable ledger as a failed run. The recovery result excludes it; no observation was overwritten.
