# ADR 0010: Harden concurrent store contract and mutation validation

- Status: Accepted
- Date: 2026-03-12

## Context

`ConcurrentInMemoryBTree` previously assumed successful append increments version by exactly `+1` and silently ignored unknown mutation types. The public store contract only guaranteed `version: bigint` and `append(...): Promise<boolean>`, so stores that jump versions could cause mutation replay and duplication. Unknown mutation payloads could be skipped while still advancing local version.

## Decision

1. Strengthen `SharedTreeStore.append` to return `{ applied, version }`, where `version` is the committed/latest store version after the append attempt.
2. On successful append, `ConcurrentInMemoryBTree` updates `currentVersion` from returned `version` rather than `+1`.
3. Reject unknown mutation types with `BTreeConcurrencyError` and do not advance local state when rejection occurs.
4. Align docs/spec with log-derived cross-instance `EntryId` semantics and fix README append example to avoid guaranteed retry exhaustion.
5. Pin GitHub Actions in workflows to full commit SHAs.

## Consequences

- Prevents duplicate replay with non-unit version increments.
- Prevents silent data loss/integrity drift from malformed mutation payloads.
- Makes distributed `EntryId` semantics explicit and testable.
- Improves CI supply-chain posture by removing floating major action tags.
