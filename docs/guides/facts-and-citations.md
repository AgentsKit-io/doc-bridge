---
title: Facts and citations
description: Cite observed CLI, configuration and syntactic API facts in Markdown.
---

# Facts and citations

Cite observed CLI, configuration and syntactic API facts in Markdown.

## Minimal example

From a built checkout, discover the checked-in CLI fixture:

```bash
node bin/ak-docs.js discover --root tests/fixtures/cli-commander --json
```

Its README cites `doc-bridge report` and `--brief`. Commands require an exact
bin-prefixed path; flags must be dash-prefixed tokens (`--flag=value` normalizes
to `--flag`). Known bins at the start of shell-fence lines also qualify; prompts
and arbitrary prose do not. Short aliases have their own facts.

The configuration fixture at `tests/fixtures/config-key-project` cites
`output.format`; bare `retry` is deliberately not a config citation. Dotted
keys resolve only within matching package/fixture boundaries. The signature
fixture at `tests/fixtures/signature-api` cites `createThing` and `ThingStore`:
uniquely resolved exported names also cite their syntactic signatures, including
aggregate public members for class/type names.

## Limits

Exact paths take precedence over codec facts, then legacy package/export names,
then fuzzy paths. Fact matching uses exact kind/name and a unique owner;
competing owners produce bounded ambiguity metadata and no chosen relation.
Repeated citations keep at most eight locations; non-symbol facts have an
independent 64-relation cap. Generated regions are excluded. Signatures use
syntax, not type inference or runtime behavior. Dynamic configuration and
unsupported CLI constructs remain explicit partial coverage.

See [Markdown matching](../spec/markdown-analyzer-v1.md),
[config facts](../spec/config-key-facts-v1.md),
[signature facts](../spec/signature-facts-v1.md) and
[discovery plugins](../spec/discovery-plugin-v2.md).
