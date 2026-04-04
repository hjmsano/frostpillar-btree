# ADR 0013: Adopt Release Please with release branch target and main default branch

- Status: Accepted
- Date: 2026-03-13

## Context

The repository keeps `main` as the default branch and enforces pull-request-based merges.
The previous release pipeline was tag-push-driven and required manual tag management to cut releases.

We need a release path that:

1. stays compatible with "require pull request before pushing to `main`"
2. automates version and changelog updates
3. preserves existing publish contracts (browser asset + GitHub Packages)
4. moves release automation to a dedicated `release` branch without changing the default branch

## Decision

1. Use `googleapis/release-please-action` in `.github/workflows/ci-release.yml` on push to `release`.
2. Configure Release Please with `target-branch: release`.
3. Keep repository default branch as `main`.
4. Let Release Please open and manage release PRs, and create tags/releases only after release PR merge.
5. Keep publish/build/upload steps in the same workflow but gate them with `steps.release.outputs.release_created == 'true'`.
6. Keep GitHub Packages publish behavior:
- owner-scoped package name `@<owner>/frostpillar-btree`
- `pnpm publish --no-git-checks`
- `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}`
7. Use `secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN` for Release Please token input.

## Consequences

- Release automation now runs from a dedicated `release` branch while `main` remains the repository default branch.
- Manual tag creation for normal releases is no longer required.
- Version/changelog quality now depends on conventional-commit-compatible messages.
- Repositories requiring broader workflow fan-out from release PR actions may need a dedicated PAT (`RELEASE_PLEASE_TOKEN`) instead of only `GITHUB_TOKEN`.
