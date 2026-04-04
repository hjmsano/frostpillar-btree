# ADR 0015: Single-pass put hot path and core bundle split

- Status: Accepted
- Date: 2026-03-24

## Context

The package goal is "lightweight, fast, tiny footprint". The current implementation still had avoidable overhead:

1. `put()` in `'replace'`/`'reject'` modes did a duplicate pre-scan and then a second traversal for insertion.
2. Comparator finite-value checks still ran on regular mutation/read paths.
3. Some redundant helpers and unused exports remained in hot modules.
4. Browser distribution had only one IIFE bundle that always included concurrent APIs, even for single-process use.

## Decision

1. **Single-pass put decision for uniqueness policies.**
   - For `'replace'` and `'reject'`, duplicate detection is resolved from the same leaf descent used to determine insertion position.
   - This removes separate duplicate pre-scan traversal from normal put flow.
2. **Move comparator finiteness checks off hot mutation/read paths.**
   - Regular operations no longer validate comparator results eagerly.
   - Finiteness/reflexivity/transitivity checks remain in `assertInvariants()`.
3. **Trim redundant code in core modules.**
   - Remove no-op/unused helpers and simplify small validation/data-path logic.
   - Use bit-shift midpoint in binary search loops on hot paths.
4. **Split browser bundle outputs.**
   - Keep full bundle (`dist/frostpillar-btree.min.js`) for complete API.
   - Add core bundle (`dist/frostpillar-btree-core.min.js`) built from `src/InMemoryBTree.ts` for smaller single-process browser usage.

## Consequences

- Put-heavy workloads in `'replace'`/`'reject'` avoid one root-to-leaf traversal in common paths.
- Regular operation latency avoids comparator finite-check overhead.
- Bundle consumers can choose smaller browser artifact when concurrency API is unnecessary.
- Comparator contract violations are detected explicitly via `assertInvariants()`, not fail-fast during normal operations.
