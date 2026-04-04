# ADR 0017: Deferred backlog checkpoint

- Status: Accepted
- Date: 2026-03-25

## Context

ADR 0016 defined four priority tiers (P0, P1, P2, Deferred) for API expansion. P0 through P2 are now complete (WI-01 through WI-11), with all quality-gate tests passing and benchmarks showing stable O(log N) scaling across all operations.

WI-12 requires reassessment of deferred items to determine whether any should be promoted, given:

1. current benchmark results
2. upstream consumer demand (primarily `frostpillar-storage-engine`)
3. implementation complexity and risk to hot paths

### Benchmark summary (post P0-P2)

All core operations show healthy normalized performance at 65K entries:

| Operation | ns/op (65K) | Scaling |
|---|---|---|
| put | 189.27 | 11.83ns/log2N |
| remove | 243.12 | 15.20ns/log2N |
| pop-first | 39.21 | 2.45ns/log2N |
| head-access | 8.72 | O(1) |
| exists-point | 182.71 | 11.42ns/log2N |
| select-point | 181.69 | 11.36ns/log2N |
| select-window | 531.91 | 33.24ns/log2N |
| put-many-empty | 73.03 | O(N) amortized |

No regression observed compared to pre-expansion baselines.

## Decision

**Keep all deferred items deferred.** None meet the promotion criteria of clear user demand combined with acceptable complexity and runtime impact.

### Item-by-item assessment

| Deferred item | Verdict | Rationale |
|---|---|---|
| `toArray`/`keysArray`/`valuesArray` | Keep deferred | Trivial user-space wrappers via spread (`[...tree.keys()]`). Zero API value over existing iterators. Adding them increases API surface without functionality gain. |
| `map`/`filter`/`reduce` | Keep deferred | Thin wrappers once iterators exist. Users compose naturally with `for...of` or `Array.from(tree.entries()).map(...)`. Library should not duplicate standard iteration patterns. |
| Full ES6 `Map` compatibility | Keep deferred | `Map` semantics (unordered, identity-based equality) conflict with B+ tree semantics (comparator-ordered, value-based equality). Forcing compatibility creates misleading API expectations. |
| Immutable API (`with`/`without`) | Keep deferred | Requires either structural sharing (complex persistent data structure) or full clone per mutation (O(N) per operation). No upstream consumer has requested immutable semantics. |
| Set operations (union, intersection, difference) | Keep deferred | Requires two-tree merge logic with comparator-aware interleaving. Performance is highly workload-dependent and difficult to guarantee without subtree-size augmentation. |
| Rank queries (kth element, rank of key) | Keep deferred | Requires subtree-size augmentation in every internal node, changing core node invariants, split/merge logic, and rebalance behavior. Highest risk to hot-path performance among all deferred items. |
| `freeze`/`unfreeze` | Keep deferred | Read-only enforcement has moderate value, but `clone()` plus caller discipline achieves the same safety. Adding freeze state to every mutation path introduces branching overhead on hot paths. |

### Promotion criteria for future reassessment

An item should be promoted from deferred when:

1. An upstream consumer (`frostpillar-storage-engine`, `frostpillar-query-engine`) has a concrete use case that cannot be efficiently achieved with the current API.
2. The implementation does not degrade existing benchmark numbers by more than 5% on any hot-path operation.
3. The implementation complexity is bounded and testable without changing core node invariants (exception: rank queries, which would require a dedicated performance evaluation).

## Consequences

- The API surface remains stable at its current size, reducing maintenance burden.
- Hot-path performance is preserved — no new branching or node augmentation in core mutation/navigation paths.
- Users who need materialized arrays, functional combinators, or freeze semantics can compose them trivially from the existing iterator and clone APIs.
- Rank queries remain the highest-value deferred item if subtree indexing becomes a requirement for `frostpillar-query-engine` (e.g., OFFSET/LIMIT support); this should be revisited when that use case materializes.
