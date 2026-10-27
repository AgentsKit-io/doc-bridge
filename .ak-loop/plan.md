# Plan followed

1. Fixture generator + bench script (scripts/), profile origin/main with --cpu-prof.
2. Fix measured costs: glob recompilation per file (src/lib/glob.ts), module x area scan in deriveAreas, per-document rebuild of module/package lookups in analyzeMarkdownDocument, repeated relative() per exclude pattern in the scan walk.
3. Prove byte identity on fixture and this repo; add count-based guards; changeset.

Departure: none. Deferred as follow-ups: repeated snapshot hashing (~0.76 s) and markdown parsing (~1.7 s).
