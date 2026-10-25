---
title: Readable vault filenames
authority: maintainer decision
status: accepted
date: 2026-10-20
sourceOfTruth: src/vault/export.ts
---

# Readable vault filenames

## Context

Obsidian Graph labels nodes with filenames. Hash-only names obscure entity
identity during navigation and presentations.

## Decision

Keep `vault.fileNames: hash` as the default to preserve existing output. Opt-in
`readable` mode places notes in type folders and derives lowercase slugs from
display names. It strips `[ ] | # ^ / \\ :` and control characters, maps other
non-alphanumeric runs to hyphens, trims hyphens, and caps slugs at 60 characters.
Empty slugs become `untitled`; collisions append the first six SHA-256 hex digits
of the stable entity ID. Note IDs and source bindings remain unchanged.

## Consequences

Readable names improve graph labels while retaining deterministic identity and
manifest ownership. The names remain opt-in because they change generated paths
and may require consumers to update existing links.
