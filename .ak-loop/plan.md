# Plan followed

- Option lives at `analysis.documents.exclude`, next to `analysis.areas` (the parent object of `areas`).
- `measureConnectivity(index, exclude)` filters only the document share; areas and graph lookups stay whole.
- All documents excluded: the document share leaves the mean, so pct rests on area coverage (no NaN).
- Doctor issues `document-exclusion-stale` (warn) and `documents-mostly-excluded` (info); text `Excluded:` line.
- Docs in `docs/spec/config-v1.md`; changeset (minor). No generated config JSON schema exists in the repo.
- Not added to the service config leaves (ADR 0012: no implicit grants); out of contract.
