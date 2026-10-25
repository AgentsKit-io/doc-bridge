---
'@agentskit/doc-bridge': patch
---

Fix `ak-docs doctor` reporting the `index-freshness` gate as stale while `ak-docs gate run index-freshness` and doctor's own freshness both said fresh. The repository scan's `safety.maxMemoryMb` limit now bounds what the scan itself grows the heap by, not the whole process heap, so a scan run by a caller that already holds memory is no longer cut short (`limits:*: partial`). Doctor also hands its discovery snapshot and rebuilt index to the gates it runs, so the gates no longer rescan and rebuild the repository a second time.
