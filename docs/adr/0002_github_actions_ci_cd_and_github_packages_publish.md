# ADR-0002: GitHub Actions CI/CD and GitHub Packages Publish Pipeline

Status: Superseded by ADR-0004
Date: 2026-03-10
Last Updated: 2026-03-10

## Context

We need automated quality checks on every push and automated package publishing when updates are merged into `main`.
The repository targets a TypeScript package and must publish through GitHub Packages.

## Decision

1. Add `ci.yml` to run lint and tests on every `push`.
2. Add `publish.yml` to run on `push` to `main` and execute:

- dependency install
- build
- publish to GitHub Packages

3. Use `GITHUB_TOKEN` with `packages: write` permission for publish authentication.
4. Set the publish-time package name to `@<owner>/frostpillar-btree` based on the repository owner.
5. Keep runtime versions aligned with project baseline (Node.js `24.x`, pnpm `10`).

## Consequences

Positive:

- Quality gates are continuously validated on all pushes.
- Main branch updates automatically produce a package publication attempt.
- No extra manual credential management is needed for GitHub-hosted publish.

Trade-offs:

- Publish fails if the package version was already published and not bumped.
- Published package scope follows repository owner, so package consumers must use scoped name.
