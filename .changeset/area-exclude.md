---
'@agentskit/doc-bridge': minor
---

Let a repository say which directories are not areas.

An area is the unit of architecture between a package and a file, derived as the first directory
level under a package's source roots. In a monorepo where every package keeps `tests/` and
`fixtures/` beside `src/`, that derives one area per directory — and the doctor's connectivity
dimension then asks for a document about a folder of test data. Dogfooding on a 26-package
monorepo, 43 of its 81 undocumented areas were `tests/` or `fixtures/`: the metric was mostly
measuring directories no documentation should describe.

`analysis.areas.exclude` takes glob patterns for directories that hold code without being a unit
of architecture. A matching candidate is not derived, and its modules fall to the most specific
area that still encloses them — or to none, which is the honest answer for a folder of fixtures.
An ownership record naming an excluded path still makes it an area: a person saying a directory is
a unit outranks a pattern saying it is not.

On that monorepo, excluding `**/tests`, `**/fixtures`, `**/__tests__` and `**/__fixtures__` took
areas from 103 to 53 and the documented share from 21% to 34%, before a single document was
written.
