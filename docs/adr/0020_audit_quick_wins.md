# ADR 0020: Audit quick wins — validation, caching, and deduplication

- Status: Accepted
- Date: 2026-03-25

## Context

A follow-up audit of the codebase after ADR 0019 identified further opportunities: a per-call height recomputation in `deleteRange`, duplicated capacity constants, missing sort-order validation in `fromJSON`, documentation gaps, and test coverage holes.

Key findings:

1. **`deleteRange` height caching**: `spliceLeafAndRebalance` recomputed tree height on every invocation during a `deleteRangeEntries` loop. Height is constant across the loop.
2. **Duplicate constants**: `MIN_NODE_CAPACITY` and `MAX_NODE_CAPACITY` were defined independently in both `types.ts` and `serialization.ts`.
3. **`fromJSON` silent misordering**: `fromJSON` passed entries directly to `putMany` without validating sort order, producing opaque insertion errors for malformed input.
4. **Documentation gaps**: `popLast()` was missing from the User Manual "Removing Entries" section. `BTreeJSON` was missing from the Exported Types tables.
5. **Test coverage gaps**: No tests for `fromJSON` sort-order validation, `deleteRange` with `autoScale`, concurrent `updateById` retry, leaf compaction stress, or `clone` with `autoScale` capacity preservation.

## Decision

### Performance

- `deleteRangeEntries` computes tree height once and passes `maxRebalanceDepth` as a parameter to `spliceLeafAndRebalance`, eliminating per-call recomputation.

### Code quality

- `MIN_NODE_CAPACITY` and `MAX_NODE_CAPACITY` are now exported from `types.ts`. `serialization.ts` imports them instead of defining its own copies.

### Validation

- `fromJSON` validates entry sort order using the provided `compareKeys` before calling `putMany`. For `reject`/`replace` duplicate-key policies, strictly ascending order is enforced. For `allow`, non-descending order is enforced. Violations throw `BTreeValidationError` with a clear message.

### Documentation

- Added `popLast()` to the User Manual "Removing Entries" section in both READMEs (EN + JA).
- Added `BTreeJSON` to the Exported Types tables in both READMEs.

### Tests

Six new tests added:

- `fromJSON` sort-order validation (reject, replace, allow policies)
- `deleteRange` combined with `autoScale`
- Concurrent `updateById` retry path
- Leaf compaction stress
- `clone` with `autoScale` capacity preservation

Test count: 382 to 388.

## Consequences

- `deleteRange` on large ranges avoids O(N) redundant height computations.
- Capacity constants have a single source of truth; future changes propagate automatically.
- `fromJSON` provides actionable error messages for malformed input instead of failing deep inside `putMany`.
- Spec updated to version 2.21 with `fromJSON` sort-order validation requirement.
- Test count increased from 382 to 388.
