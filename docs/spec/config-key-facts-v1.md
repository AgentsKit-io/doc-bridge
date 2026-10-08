---
title: Configuration key facts v1
description: Extract bounded static configuration keys and resolve context-bound Markdown citations.
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/facts/config.ts
validationPath: pnpm vitest run tests/config-facts.test.ts
---

# Configuration key facts

The deterministic `js-ts:config-key` extractor reads scan-local TypeScript syntax
trees and JSON Schema bytes. It never imports schemas or executes repository
code. Its independent version and `config-keys` coverage enter semantic identity
through the shared discovery fact hook.

## Selection and ownership

Select exported Zod schemas whose names contain `config`, exported schemas in
files named `*config*schema*` or `*schema*config*`, and `config/schema.ts`.
A variable statement tagged `/** @docbridgeConfig */` explicitly declares a
schema without adding a discovery configuration key. `defineConfig` may wrap
a Zod schema; runtime configuration values are not schemas. Imports must identify
Zod's `z` binding. Helper schemas and literal constants resolve only within the
same file. Helpers referenced by selected roots contribute nested keys rather
than duplicate bare keys. Nested test fixtures are excluded when analyzing their
parent repository; a fixture analyzed as the repository root is supported.

JSON Schema selection uses a configuration-schema filename or an explicit title
containing `config`. Local JSON Pointer `$ref` values resolve
within that file; remote references are unsupported. Source schemas belong to
their modules. JSON schemas use an already discovered entity for their file,
otherwise their containing package. No synthetic JSON module is created.
Missing ownership prevents complete extraction.

## Identity and values

Each key is a codec-backed `config-key` fact; `ownerId` and its dotted `name`
determine its ID. Literal dots in property names produce partial coverage.
Object keys and nested object properties are emitted. Arrays and records
contribute item/value schemas to their own key's hash without synthetic dotted
array indexes or dynamic record keys.

`valueHash` hashes type, optionality, literal default and sorted enum members,
with nested object/item/variant schemas where applicable. Zod defaults allow
omitted input; JSON Schema defaults do not override `required`. A changed
default produces a generic `changed` delta with before/after hashes. Defaults
are hashed rather than copied into metadata. Documentation default claims remain
the parity registry's responsibility.

Operational defaults also contribute to this projection when a defaults function
uses a same-file or imported Zod-inferred type derived from the selected schema
as its config parameter. A direct object return may assign literals, local constant
literals, or the matching config path's nullish fallback to known keys. Nested
object assignments preserve the schema owner and key identity. Caller-config
spreads are supported; other spreads, dynamic expressions, control flow,
conflicting assignments and ambiguous roots produce partial coverage without
invented default values. Source and defaults-module hashes retain scan evidence;
an assigned key lists its default assignment location first while retaining
schema ownership.
No module is imported or executed.

Unresolved references, dynamic defaults, open record/passthrough keys, refinement callbacks, unsupported transformations,
computed/spread properties, recursion, conflicts and exceeded bounds produce
explicit partial coverage. Extraction allows 32 nesting steps, 4,096 facts per
file and per run, 128 per-file coverage details and names up to 256 characters.
Partial coverage cannot prove removal.
Refinements and scalar validation constraints preserve this type/key/default
projection.

## Citations and compatibility

Inline-code dotted paths match exactly within the same package and test-fixture
boundary as the source evidence. Bare leaf aliases (including top-level keys)
require example syntax and an independent owner anchor in the same document. Examples are JSON/JSONC/YAML/TOML
key assignments, JS/TS object literals, or inline code
immediately labeled “configuration example”. The document must also cite the
schema file/export or a dotted key of that owner; a leaf must be unique within
that owner. Multiple eligible owners remain ambiguous. Bare prose, unanchored
examples, generated anchors and repeated leaves within an owner stay unresolved.
Bare aliases select terminal schema keys, excluding object parents with known
descendants. Object examples retain their nested paths, which must match the
canonical key. All root keys must belong to that schema, or the example must be
a single-key fragment. This prevents unrelated workflow and index artifacts
from borrowing a config anchor elsewhere in the document. JSON/JSONC and YAML
use syntax trees with at most 32 nesting steps; TOML supports flat assignments
only. TypeScript property
signatures, arrays of config fragments, and TOML tables remain unresolved. Canonical dotted citations retain their existing behavior.
Exact repository paths retain precedence. Relations target the owner with
`metadata.factKind: "config-key"` and canonical dotted `metadata.factName`.
Historical verification reuses the same context-bound matches for removed keys
and changed values. Generated regions, relation caps and evidence bounds remain
in force.

Existing open metadata and the surface-fact codec preserve strict
`DocBridgeIndexV1` and `AgentHandoffV1` envelopes. Facts are not retrieval entries;
the projection still indexes documents and modules only.

## Parent-local value identity

Config extractor version 1.2.0 adds optional `ownValueHash` to surface facts.
It uses the existing projection/hash codec with immediate child properties
excluded; parent optionality, defaults, enum, items and variants remain included.
Diff can therefore suppress additive-only child changes without hiding a
simultaneous parent-local modification. Missing local hashes cannot prove that
only children changed. Value hashes, IDs and index/handoff schemas are unchanged.
