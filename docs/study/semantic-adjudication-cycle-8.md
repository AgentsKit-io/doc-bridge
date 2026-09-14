# Cycle 8 — Bounded semantic adjudication

Run evidence: `.codex/verification-0.28-round28/semantic-adjudication/`.

Hypothesis: published metadata, CI configuration, and the deterministic README gate can distinguish a real contradiction from a local unreleased version, substantiate a CI claim, and expose remaining deterministic gaps without automatic documentation edits.

Budget: local read-only inspection, one npm metadata lookup, one deterministic README gate, no provider calls, no automatic documentation edits, and no external tracking mutation.

- [x] **1. Freeze the adjudication scope and keep it read-only.**
- [x] **2. Load the prior two-model semantic review as candidate evidence.**
- [x] **3. Resolve the published npm version from package metadata.**
- [x] **4. Compare the published version with the README claim.**
- [x] **5. Classify the local `package.json` version separately from the published version.**
- [x] **6. Verify the README gate is configured on the pull-request workflow.**
- [x] **7. Re-run the deterministic README gate and preserve its failure output.**
- [x] **8. Reproduce the onboarding overlap candidate.**
- [x] **9. Record adjudications without silently editing documentation.**
- [x] **10. Preserve the open source-hash gap and define the next corrective action.**

Decision: bounded adjudication completed. The published version and README agree (`1.7.45`); the local `package.json` version (`1.8.0`) is not a contradiction by itself. The CI claim is substantiated by `.github/workflows/ci.yml`. The README gate exposes three stale generated source hashes, which is the next deterministic correction. The onboarding overlap remains a low-severity documentation-ownership candidate. No automatic documentation edit is authorized.
