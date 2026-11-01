---
'@agentskit/doc-bridge': patch
---

Fix search ranking that an unrelated file could reorder. Graph proximity skipped every one of the ten strongest lexical hits, so two strong hits that import or cite each other got no support from each other and tied at the BM25 saturation ceiling; the tie was then decided by corpus-wide field lengths, and adding a file that matches nothing in the query pushed the answer out of the top three. An anchor one hop from another anchor now earns proximity too. Retrieval benchmark: hit@3 86.7% → 88.3%, hit@1 70.0% → 71.7%, MRR 0.779 → 0.791.
