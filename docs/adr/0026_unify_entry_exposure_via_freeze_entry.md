# ADR 0026: Unify public entry exposure via freezeEntry

- Status: Accepted
- Date: 2026-04-08

## Context

ADR 0025 introduced two distinct strategies for exposing entries through the public API:

- **Bulk APIs** (`entries`, `entriesReversed`, `forEach`, `forEachRange`, `snapshot`): return internal entry references directly via `freezeEntry` (zero allocation, since `Object.freeze` is idempotent on already-frozen objects).
- **Single-entry APIs** (`peekFirst`, `peekLast`, `findFirst`, `findLast`, `getPairOrNextLower`, `remove`, `removeById`, `peekById`, `updateById`, `popFirst`, `popLast`, `range`): return shallow copies via `toPublicEntry` (one allocation per call, creating a new object and freezing it).

The rationale for `toPublicEntry` at ADR 0025 time was "spec-mandated isolation": the caller's reference was intentionally decoupled from the internal object. However, this isolation provides no correctness benefit now that:

1. `createEntry` freezes every entry at birth with a canonical property order.
2. `updateEntryById` replaces the entry object in the leaf array (replace-not-mutate); it never mutates a live reference.

A caller holding an internal entry reference will always observe a frozen, stable object — whether or not the B-tree has since replaced that entry internally. The shallow copy in `toPublicEntry` allocates a new object with identical frozen contents, providing no additional immutability or isolation guarantee.

The two-function design (`toPublicEntry` / `freezeEntry`) is also inconsistent: both paths return frozen entries, but the choice between them is an artifact of when each API was optimized, not a principled distinction.

## Decision

1. **Delete `toPublicEntry`.** All public API entry exposure uses `freezeEntry`.
2. **`freezeEntry` is the single canonical helper** for converting an internal `LeafEntry` to a public `BTreeEntry`. It calls `Object.freeze` (idempotent, no-op on already-frozen objects) as a defensive guarantee, then casts the type.
3. **No behavioral change**: all returned entries remain frozen at runtime. Tests that assert `Object.isFrozen(entry)` continue to pass unchanged.

## Consequences

### Correctness

No change. `freezeEntry` calls `Object.freeze`, so even if a non-frozen entry were passed (which cannot happen given `createEntry`), the output would still be frozen.

### Performance

Single-entry APIs (`peekFirst`, `findFirst`, `range`, etc.) no longer allocate a new object per call. For APIs like `range()` that return many entries, this is equivalent to the gain ADR 0025 delivered for bulk iteration.

### Simplicity

`toPublicEntry` is removed. One helper, one rule: `freezeEntry` for all public entry exposure.

### Spec

Updated spec version 2.29 to 2.30:

- Section 7.1: All public API operations MUST expose entries via `freezeEntry`. The `toPublicEntry` shallow-copy path is removed.
- Section 7.1: `range()` MUST produce public entries via `freezeEntry` in a single pass during collection.
