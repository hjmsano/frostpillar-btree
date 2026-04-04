# ADR-0009: Enforce Publish Contract Assertions in Workflow Contract Tests

Status: Accepted
Date: 2026-03-11
Last Updated: 2026-03-26

## Context

The active release workflow runs on push to `release` and uses Release Please to create releases and gate publish steps.
This ADR now aligns with the workflow architecture formalized in ADR-0013.
The existing contract test coverage verified trigger, quality checks, build, and release artifact upload, but did not verify publish guarantees.

This left a regression gap:

- package publish steps could be removed while contract tests still passed
- owner-scoped package naming could drift from `@<owner>/frostpillar-btree`
- publish authentication for GitHub Packages could be dropped unintentionally

## Decision

For `ci-release.yml`, contract tests must explicitly assert:

1. `permissions.packages: write`
2. `actions/setup-node` uses `registry-url: https://registry.npmjs.org`
3. publish-time package name is owner-scoped (`@frostpillar/frostpillar-btree`)
4. package publish command runs non-interactively (`pnpm publish --no-git-checks --access public`)
5. publish authentication uses NPM's Trusted Publisher

## Consequences

Positive:

- Spec requirements for package publish are now guarded by executable tests.
- CI fails immediately when publish contract behavior regresses.
- Release workflow documentation and tests stay aligned.

Trade-offs:

- Regex-based workflow assertions require maintenance if YAML formatting changes significantly.
- Additional assertions modestly increase test maintenance scope.

## Supersedes

This ADR complements ADR-0007 by tightening coverage for release publish behavior; it does not supersede prior ADRs.

## References

- https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- https://docs.github.com/actions/publishing-packages/publishing-nodejs-packages
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
