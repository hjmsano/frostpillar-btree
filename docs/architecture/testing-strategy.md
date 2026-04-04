# Testing Strategy

Status: Active
Last Updated: 2026-03-24

## Workflow contract

Required order for all behavior changes:

1. Update spec in `docs/specs/`
2. Add or update failing tests
3. Implement code
4. Run verification commands

## Test layers

1. Unit tests

- Key comparison, bounds search, node capacity validation, CAS retry logic

2. Component tests

- Insert/remove/pop/range across split and merge scenarios

3. Concurrency tests

- multi-coordinator lost-update prevention using shared store
- retry behavior under append version conflicts
- append response contract validation (`applied/version` monotonicity)
- overlap safety between in-flight append and sync on a single coordinator instance

4. Invariant tests

- leaf ordering, branch ordering, balanced depth, leaf links, and counts

5. Contract tests

- bundle build configuration contract (`bundleBuildContract`)
- dual browser bundle output contract (full + core bundles)
- GitHub Actions workflow contract (`githubActionsWorkflows`)

## Determinism rules

- Use deterministic datasets in tests.
- Do not depend on network or files outside project root.
- Keep tests runtime-portable.

## Verification commands

- `pnpm test`
- `pnpm test <path>.test.ts`
- `pnpm check`
- `pnpm bench` (manual-only benchmark; excluded from `pnpm test` and `pnpm check`)
- Run `pnpm build` before `pnpm bench` to avoid stale `dist` benchmarking.
