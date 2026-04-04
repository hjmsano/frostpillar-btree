# ADR-0005: Use `release.published` for GitHub Packages Publish Trigger

Status: Superseded by ADR-0008
Date: 2026-03-10
Last Updated: 2026-03-11

## Context

ADR-0004 selected `release` event `types: [created]` for package publish trigger.
In practice, release publication flows can emit `published` as the stable signal for actual release publish timing, especially when draft/pre-release paths are involved.

We need publish automation to run when the release is actually published, not only when it is initially created.

## Decision

1. Change publish workflow trigger to `on.release.types: [published]`.
2. Keep existing publish permissions/authentication (`packages: write`, `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}`).
3. Update contract tests and specs to enforce `published` trigger.

## Consequences

Positive:

- Publish workflow aligns with release publication timing.
- Draft-to-published and pre-release publication paths are covered by a single event contract.

Trade-offs:

- Repositories depending on `created` semantics must migrate tests/docs.

## Supersedes

This ADR supersedes only the release event type decision in ADR-0004 (`types: [created]` -> `types: [published]`).

## Superseded By

This ADR is superseded by ADR-0008, which removes the separate `release` event publish trigger and consolidates release creation and package publish into a single tag-push workflow job.

## References

- https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#release
- https://docs.github.com/actions/publishing-packages/publishing-nodejs-packages
