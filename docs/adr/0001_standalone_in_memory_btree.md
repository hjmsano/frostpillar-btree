# ADR-0001: Standalone In-Memory B+ Tree Package Baseline

Status: Accepted
Date: 2026-03-09
Last Updated: 2026-03-10

## Context

The B+ tree implementation was previously embedded in Frostpillar datastore internals.
We need a reusable standalone package with minimal dependencies, strict typing, deterministic behavior,
and safe multi-process coordination when several processes operate on the same logical tree.

## Decision

1. Publish a standalone in-memory B+ tree package with a generic key-value API.
2. Keep zero runtime dependencies and use platform tooling (Node test runner, TypeScript, ESLint).
3. Preserve core B+ tree invariants: balanced leaves, occupancy rules, ordered traversal, linked-leaf correctness.
4. Keep base `InMemoryBTree` API focused on core operations (`put`, `remove`, `popFirst`, `range`, `size`, stats, invariant assertion).
5. Add a concurrency coordination layer for beyond-single-process safety:
- `ConcurrentInMemoryBTree` for async mutation/read coordination.
- Keep storage implementation external to this project by providing a generic store interface.
6. Keep documentation set small and current, and provide bilingual user docs (EN/JA).

## Consequences

Positive:

- Reusable component decoupled from Frostpillar record model
- Lower maintenance overhead
- Predictable behavior with invariant checks
- Cross-process mutation safety when all writers use the same CAS-backed shared store

Trade-offs:

- Coordinated operations are async and slower than local in-memory calls
- Cross-process guarantees depend on shared store correctness (atomic CAS and lock discipline)
