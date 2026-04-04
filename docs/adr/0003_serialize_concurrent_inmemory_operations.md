# ADR-0003: Serialize Async Operations in ConcurrentInMemoryBTree

Status: Accepted
Date: 2026-03-10
Last Updated: 2026-03-10

## Context

`ConcurrentInMemoryBTree` uses a shared append-log store and applies remote mutations into a local in-memory tree.
Without per-instance serialization, overlapping async operations (`sync` and mutation append paths) can interleave in a way that applies the same mutation twice locally.

This can happen when:

- a mutation append succeeds in the shared store but the local apply step is still in-flight, and
- another `sync` starts from the old local version and replays the just-appended mutation.

The result can be duplicated entries and local/store version drift.

## Decision

1. Serialize async operations per `ConcurrentInMemoryBTree` instance with an internal promise queue (critical section).
2. Route all public async APIs (`sync`, reads, and mutations) through that queue.
3. Keep optimistic retries against the shared store, but run retry loops inside the serialized section.
4. Extract shared mutation replay logic into one helper (`applyMutation`) and reuse it from both sync and append-success paths.

## Consequences

Positive:

- Prevents local double-apply races on overlapping async operations.
- Keeps behavior deterministic for a single coordinator instance.
- Reduces drift risk between local `currentVersion` and shared store version.
- Centralized mutation-apply logic improves maintainability.

Trade-offs:

- Per-instance operations are serialized, so overlapping calls on the same instance no longer execute in parallel.
- Throughput for one instance is bounded by single-operation-at-a-time execution.

## Verification

- Add deterministic race regression tests:
  - overlap between in-flight append and `sync` must not duplicate entries.
  - overlapping `sync` calls remain safe.
- Keep existing conflict-retry tests green.
