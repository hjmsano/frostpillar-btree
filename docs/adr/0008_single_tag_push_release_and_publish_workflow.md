# ADR-0008: Consolidate Release Creation and Package Publish into a Single Tag-Push Workflow

Status: Superseded by ADR-0013
Date: 2026-03-11
Last Updated: 2026-03-11

## Context

The repository currently operates with a tag-triggered release workflow (`push.tags: v*`) that already:

- runs quality checks (`pnpm check`)
- builds package output and browser minified bundle
- creates GitHub Release and uploads the bundle asset
- sets owner-scoped package name and publishes to GitHub Packages

Earlier ADRs (ADR-0004 and ADR-0005) described a two-workflow chain where publish was triggered by `release` events.
That event-based publish trigger no longer reflects the implemented and specified architecture.

## Decision

1. Standardize on one workflow (`ci-release.yml`) triggered by version tag push (`v*`).
2. Execute release creation and GitHub Packages publish within the same workflow job.
3. Keep publish-time package naming owner-scoped (`@<owner>/frostpillar-btree`).
4. Keep publish authentication via `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}` with `packages: write` permission.
5. Enforce this contract through workflow contract tests.

## Consequences

Positive:

- Removes cross-workflow event dependency and simplifies CI/CD behavior.
- Keeps release artifact and package publish steps in one auditable execution path.
- Reduces ambiguity around `release.created` vs `release.published` semantics.

Trade-offs:

- Publish no longer has a distinct post-release-event trigger boundary.
- Failures in one job can block both release completion and package publish.

## Supersedes

- ADR-0005 (release event `types: [published]` publish trigger decision)
- The two-workflow/event-chained publish trigger portion of ADR-0004

## References

- https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#push
- https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
