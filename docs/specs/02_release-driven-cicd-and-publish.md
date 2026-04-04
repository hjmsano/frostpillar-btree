# Spec: Release-Driven CI/CD and Publish

Status: Active
Version: 2.6
Last Updated: 2026-04-04

## 1. Scope

This document defines workflow contracts for release automation in `.github/workflows/`.

In scope:

- release trigger from `main` push via Release Please
- automated release PR creation and version/changelog updates
- package verification and build
- browser bundle artifact generation and attachment
- browser bundle environment contract (`ES2020` + `moduleResolution: bundler`)
- README browser usage sample contract (`README.md`, `README-JA.md`)
- GitHub Packages publish with owner-scoped package name
- hybrid delivery contract (GitHub Release bundle + npm package publish)

Out of scope:

- npmjs.com publish
- custom release-note authoring beyond generated notes

## 2. Trigger Contract

- Pushing to `main` MUST trigger `ci-release.yml`.
- `ci-release.yml` MUST run Release Please first.
- `ci-release.yml` MUST configure Release Please target branch as `main`.
- Version tag and GitHub Release creation MUST be performed by Release Please after the release PR is merged.
- Build/package publish and browser asset upload MUST run only when Release Please reports `release_created = true`.
- Draft release flows created manually from GitHub UI are not required.

## 3. Release Workflow Contract (`.github/workflows/ci-release.yml`)

On `main` push, the workflow MUST:

1. execute `googleapis/release-please-action` to manage release PR and release creation
2. configure Release Please with `target-branch: main`
3. run build/publish steps only when `steps.release.outputs.release_created == 'true'`
4. install dependencies using frozen lockfile
5. run `pnpm check` (subsumes typecheck, lint, test, and textlint — no separate `pnpm test` step)
6. run `pnpm build`
7. build browser bundles by running:
   - `pnpm build:bundle` (`dist/frostpillar-btree.min.js`, global `FrostpillarBTree`)
   - `pnpm build:bundle:core` (`dist/frostpillar-btree-core.min.js`, global `FrostpillarBTreeCore`)
8. upload both `dist/frostpillar-btree.min.js` and `dist/frostpillar-btree-core.min.js` to the GitHub Release created by Release Please
9. configure owner-scoped package name `@<owner>/frostpillar-btree`
10. publish to `https://registry.npmjs.org`

Bundle configuration contract:

- `tsconfig.bundle.json` MUST exist at repository root.
- `tsconfig.bundle.json` MUST set:
  - `compilerOptions.target = ES2020`
  - `compilerOptions.moduleResolution = bundler`
- Browser full-bundle entry point MUST be `src/index.ts` so the release bundle includes all public features exported by the project.
- Browser core-bundle entry point MUST be `src/InMemoryBTree.ts` for single-process use without concurrent API surface.
- Browser release artifacts MUST include:
  - `dist/frostpillar-btree.min.js` (global `FrostpillarBTree`)
  - `dist/frostpillar-btree-core.min.js` (global `FrostpillarBTreeCore`)
- The npm package build contract remains unchanged (`pnpm build` from `tsconfig.json`) to preserve hybrid delivery.
- `tsconfig.json` for npm package output MUST keep `compilerOptions.target = ES2022`.
- npm package publish artifacts MUST include:
  - `dist`
  - `README.md`
  - `README-JA.md`
  - `LICENSE`

README browser usage sample contract:

- `README.md` and `README-JA.md` MUST each include a browser usage section with runnable JavaScript examples.
- The sample MUST describe both browser bundle choices and their globals.
- The sample MUST use a JavaScript comparator function body (no TypeScript type annotations).

Required auth/permissions:

- `permissions.contents: write`
- `permissions.pull-requests: write`
- `permissions.packages: write`
- Release Please token MUST be `${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}`
- upload to GitHub Release uses `GH_TOKEN=${{ secrets.GITHUB_TOKEN }}`
- setup-node uses `registry-url: https://registry.npmjs.org`
- publish uses `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}`
- if only `GITHUB_TOKEN` is used for Release Please, repository settings MUST allow GitHub Actions to create pull requests

## 4. CI Workflow Contract (`.github/workflows/ci.yml`)

- `ci.yml` MUST trigger on push.
- `ci.yml` MUST include pushes to `main` (no `main` exclusion filter).
- `ci.yml` MUST install dependencies with frozen lockfile.
- `ci.yml` MUST run `pnpm check` (subsumes typecheck, lint, test, and textlint — no separate `pnpm test` step).

## 5. References

- https://docs.github.com/actions/reference/workflows-and-actions/events-that-trigger-workflows#push
- https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
- https://github.com/googleapis/release-please-action
- https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://docs.github.com/actions/security-for-github-actions/security-guides/automatic-token-authentication
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
