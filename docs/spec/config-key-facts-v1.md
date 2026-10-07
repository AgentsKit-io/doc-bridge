---
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

Unresolved references, dynamic defaults, open record/passthrough keys, refinement callbacks, unsupported transformations,
computed/spread properties, recursion, conflicts and exceeded bounds produce
explicit partial coverage. Extraction allows 32 nesting steps, 4,096 facts per
file and per run, 128 per-file coverage details and names up to 256 characters.
Partial coverage cannot prove removal.
Refinements and scalar validation constraints preserve this type/key/default
projection.

## Citations and compatibility

Inline-code dotted paths match exactly within the same package and test-fixture
boundary as the source evidence. Bare leaf aliases and undotted top-level names
produce no config relation, avoiding incidental common-word matches. Exact
repository paths retain precedence. Relations target the owner with
`metadata.factKind: "config-key"` and canonical dotted `metadata.factName`.
Existing generic historical verification handles removed keys. Generated
regions, relation caps and evidence bounds remain in force.

Existing open metadata and the surface-fact codec preserve strict
`DocBridgeIndexV1` and `AgentHandoffV1` envelopes. Facts are not retrieval entries;
the projection still indexes documents and modules only.
