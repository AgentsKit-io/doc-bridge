# Controlled A/B study — adjudicated cost round

This round compares `repository-only` with `deterministic-doc-bridge` using 24 anonymized task definitions, two configured CLI models, one replicate, and 48 observations per arm. The run completed all 96 planned observations and records execution failures rather than dropping them.

## Result

The deterministic Doc Bridge arm completed 42/48 executions (87.5%) versus 36/48 (75.0%) for repository-only. Its latency p95 was 84,440 ms versus 124,193 ms. Across 46 paired observations with token data, the deterministic arm used 53,325 fewer provider token-equivalent units on average (−18.459%). Provider token-equivalent units are input plus output tokens; they are not currency.

Evidence citation was unchanged at 93.75%. The high-quality evidence rate was 20.833% for deterministic Doc Bridge versus 22.917% for repository-only. The independent bounded adjudicator recorded zero successful outcomes in both arms. That means this run does not demonstrate improved semantic correctness, even though it shows directional operational improvement.

The result is `inconclusive`. It is useful as an auditable directional measurement, not as a causal, enterprise-readiness, or USD-cost claim.

## Provenance

- Plan: `ab-adjudicated-cost-plan-v2-v1.json`, hash `f61bf70063fcceb9dfe823ac9d0707f0f004a075143cae6e9518523c64ba1b4f`
- Run: `phase-9-ab-adjudicated-cost-03`
- Ledger hash: `cc3eb8a816f961b4a4d8fdefd96365e6b89f3fd7d5aad287c3c5cc79a80ed0f5`
- Metrics report hash: `d2849c3515da91385af91e9a80b70fa25b5f2ad6f248255229aba6ce73b3fd22`
- Structured result: [ab-adjudicated-cost-result-v1.json](./ab-adjudicated-cost-result-v1.json)

## What changed from the previous round

- Provider token totals are now derived and labeled as token-equivalent units when both input and output counts exist.
- Provider-reported outcomes are no longer treated as the final outcome; the runner records a deterministic bounded adjudication.
- Child process groups are terminated on timeout or output limits, preventing nested CLI processes from surviving a failed observation.

## Remaining measurement gap

The adjudicator is mechanical and bounded. It does not independently judge whether the answer is semantically correct, whether documentation claims are true, or whether a repository change is safe. A future round needs a blinded human or separately configured review agent with an explicit rubric before correctness or quality claims can be strengthened.
