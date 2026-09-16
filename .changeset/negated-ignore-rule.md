---
'@agentskit/doc-bridge': patch
---

Stop reporting a path an ignore rule rescues as unreproducible.

`git check-ignore --verbose` emits a record for every path that *matched* a rule, including the path
a `!` negation rescues — and such a path is precisely one Git does not ignore. The reproducibility
check read the record without reading the pattern, so `dist/*` plus `!dist/keep.js` reported
`dist/keep.js` as a reason the index could not be rebuilt from a clean checkout. The opposite of
what the rule says, stated confidently.

The window is narrow: `check-ignore` stops reporting a path once it is committed, and a path rescued
by a negation is usually committed, which is the point of rescuing it. It shows up while such a path
is still untracked — a file added but not yet committed.

Found by turning the new `index-reproducible` gate on in this repository, which had to add
`!.doc-bridge/index.json` to its own `.gitignore` to commit the index the gate verifies.
