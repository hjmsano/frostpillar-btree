# ADR 0011: Add manual complexity benchmark runner

- Status: Accepted
- Date: 2026-03-13

## Context

The spec defines complexity expectations (`put`/`remove`: `O(log N)`, head access: `O(1)`), but the repository had no benchmark command to validate scaling behavior or detect performance regressions over time.

Running performance tests inside `pnpm test` or `pnpm check` would add noise and make CI unstable across machines.

## Decision

1. Add `scripts/run-benchmarks.mjs` for manual complexity trend checks.
2. Expose the benchmark via `pnpm bench`.
3. Keep benchmark execution out of default quality gates (`pnpm test`, `pnpm check`).
4. Benchmark report must show multiple input sizes and normalized indicators so log-growth, head-access, and select (`range`) trends can be reviewed quickly.

## Consequences

- Performance checks become available on demand without destabilizing automated tests.
- Regressions in scaling behavior can be identified through normalized trend output.
- Documentation and spec now explicitly separate correctness tests from manual performance checks.
