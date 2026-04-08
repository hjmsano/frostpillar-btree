# ADR-0004: Release-Driven CI/CD and Publish Trigger

Status: Partially Superseded by ADR-0005 and ADR-0008
Date: 2026-03-10
Last Updated: 2026-03-11

## Context

Current CI/CD direction was defined for publish on `push` to `main`.
New requirement changes publish timing and release behavior:

- CI/CD must start from version tag push.
- GitHub Release must be created from the pushed tag.
- Release must include browser bundle artifact (`.min.js`).
- GitHub Packages publish must run on release creation.

This keeps release and package publication aligned as a single release event contract.

## Decision

1. Add a tag-triggered release workflow (`push.tags: v*`) that runs:

- dependency install
- `pnpm check`
- `pnpm build`
- browser minified bundle build (`dist/frostpillar-btree.min.js`)
- GitHub Release creation from tag and asset upload

2. Add a publish workflow triggered by `release` event (`types: [created]`).
3. Keep `GITHUB_TOKEN` authentication for package publish with `packages: write`.
4. Set publish-time package name to `@<owner>/frostpillar-btree`.
5. Keep runtime versions aligned with project baseline (Node.js `24.x`, pnpm `10`).

## Consequences

Positive:

- Release artifacts and package publication are tied to version tags.
- Browser-consumable minified bundle is consistently attached to each release.
- Package publish occurs after release creation, reducing branch-based accidental publish.

Trade-offs:

- Two workflows are chained by event, so failures can happen in either workflow.
- If release is manually created without proper tag state, automation can fail.

## Supersedes

This ADR supersedes the publish trigger decision in ADR-0002 (publish on `push` to `main`).

## References

- https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#release
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
- https://cli.github.com/manual/gh_release_create
