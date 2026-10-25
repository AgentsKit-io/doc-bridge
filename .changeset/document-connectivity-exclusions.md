---
'@agentskit/doc-bridge': minor
---

Add `analysis.documents.exclude`, a list of `{ pattern, reason }` entries that declare documents which are not about the repository's code, such as published guides for readers. The doctor drops them from the connectivity document share (numerator and denominator) while they still count for reachability, retrieval, gates and area coverage. `DoctorConnectivity` gains `documentsExcluded` and `exclusions`, the text output prints an `Excluded:` line, a pattern that matches nothing is a warning, and excluding more than half of all documents is reported as info.
