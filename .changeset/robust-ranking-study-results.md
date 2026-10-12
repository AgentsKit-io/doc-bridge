---
"@agentskit/doc-bridge": patch
---

Retrieval ranking: canonicality is now measured above the corpus PageRank floor, so a record nothing links to earns no bonus for being a document, and a new aboutness prior rewards records whose title, headings or path cover the query. Retrieval benchmark hit@3 stays at 88.3% with the minimal study results report added to `docs/study/`, instead of falling to 86.7%. The `search --explain --text` view prints the multiplicative `prior` and `aboutness` components as factors (`×1.2`) and skips them when neutral.
