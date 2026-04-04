# ADR 0012: Couple append/apply path and fail fast on invalid comparator behavior

- Status: Accepted
- Date: 2026-03-13

## Context

Three maintainability and correctness gaps were identified:

1. `ConcurrentInMemoryBTree` used a two-step mutation flow (`appendMutationUnlocked` then caller-side local apply). The pattern relied on each caller remembering to apply exactly once after append success.
2. Comparator contract violations (`NaN`, non-reflexive behavior, observed transitivity breaks) were not explicitly rejected, which could silently corrupt ordering assumptions.
3. Internal ID-based mutations used repeated `entryId as bigint` casts, which bypassed branded `EntryId` intent.

## Decision

1. Replace the two-step concurrent mutation flow with a single typed internal path that appends and applies locally in the same method (`appendMutationAndApplyUnlocked`).
2. Centralize local mutation dispatch in one helper (`applyMutationLocal`) and reuse it from both sync replay and append-success application.
3. Add comparator fail-fast validation for:
- finite numeric results
- reflexivity (`compare(x, x) === 0`)
- observed transitivity checks on ordered triples during mutation/invariant validation
4. Replace inline `EntryId` casts with an explicit `unwrapEntryId` helper.

## Consequences

- Reduces drift risk from future mutation additions forgetting a local apply step.
- Makes comparator misuse explicit and typed (`BTreeValidationError`) instead of silent corruption.
- Preserves branded ID intent while keeping bigint interoperability explicit at boundaries.

