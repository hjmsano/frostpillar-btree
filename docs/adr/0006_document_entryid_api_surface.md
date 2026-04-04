# ADR 0006: Document EntryId-centric API surface consistently

- Status: Accepted
- Date: 2026-03-10

## Context

`InMemoryBTree` already provides `EntryId` return values from `put` and ID-based operations (`removeById`, `peekById`, `updateById`) in implementation and exports. However, spec and user-facing docs (`README.md` / `README-JA.md`) previously described `put` as returning `void` and omitted several ID-based methods.

This mismatch can cause integration bugs where users ignore stable IDs and fall back to key-based deletion in duplicate-key scenarios.

## Decision

We standardize docs/spec contracts to match the implemented API:

- `put(key, value): EntryId`
- `removeById(entryId)`, `peekById(entryId)`, `updateById(entryId, value)`
- Concurrent API summary includes async `removeById`, `updateById`, and `snapshot`

We add contract tests so future doc edits cannot accidentally regress this alignment.

We also align the README quick example to capture `EntryId` and show `peekById` so ID-safe operations are visible at first glance.

## Consequences

- Public docs now accurately represent usable API.
- Consumers can safely rely on EntryId for precise mutation of duplicate keys.
- CI detects contract drift between docs/spec and implementation earlier.
