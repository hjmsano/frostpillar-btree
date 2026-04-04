# ADR 0022: Consolidate release automation onto main branch

- Status: Accepted
- Date: 2026-04-04

## Context

ADR-0013 introduced Release Please with a dedicated `release` branch as the target, keeping `main` as the default branch. In practice, maintaining a separate `release` branch added operational overhead (syncing, branch protection rules, contributor confusion) without meaningful benefit — `main` already serves as the integration branch where all PRs merge.

## Decision

1. Change `ci-release.yml` trigger branch from `release` to `main`.
2. Change Release Please `target-branch` from `release` to `main`.
3. All other release workflow behavior (build, publish, asset upload, gating on `release_created`) remains unchanged.

## Consequences

- Release Please now opens version-bump PRs directly against `main`, eliminating the need for a separate `release` branch.
- The contributor workflow is simplified: merge to `main` is the only required step.
- Branch protection for `main` continues to enforce pull-request-based merges.
- The `release` branch is no longer required and can be removed from the repository.

## Supersedes

- [ADR 0013: Adopt Release Please with release branch target and main default branch](./0013_adopt_release_please_for_protected_main_release_flow.md)
