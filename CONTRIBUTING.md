# Contributing to frostpillar-btree

Thank you for considering a contribution! This guide covers setup, workflow, and expectations.

## Prerequisites

- Node.js >= 24
- pnpm >= 10

## Getting Started

```bash
git clone https://github.com/hjmsano/frostpillar-btree.git
cd frostpillar-btree
pnpm install
```

## Development Workflow

This project follows a **Spec-Driven Development (SDD) + Test-Driven Development (TDD)** workflow:

1. **Spec first** -- Update or create the relevant spec in `docs/specs/` before writing code.
2. **Test first** -- Write failing tests that match the spec.
3. **Implement** -- Write the minimal code to pass the tests.
4. **Verify** -- Run `pnpm check` to ensure everything passes.

## Running Checks

```bash
pnpm check        # Runs typecheck, lint, test, and textlint (all at once)
pnpm test          # Unit tests only
pnpm typecheck     # TypeScript type checking
pnpm lint          # ESLint
pnpm textlint      # Markdown linting
```

All checks must pass before submitting a pull request.

## Code Conventions

- **TypeScript strict mode** -- No `any` types.
- **Named exports only** -- No `default` exports.
- **Zero runtime dependencies** -- Only `devDependencies` are allowed.
- **Function length** -- Max 50 lines per function (excluding blank lines and comments).
- **File length** -- Max 300 lines per file.

## Pull Requests

1. Create a feature branch from `main`.
2. Keep changes focused -- one concern per PR.
3. Fill in the PR template (summary, change type, checklist).
4. Ensure `pnpm check` passes.
5. Update `README.md` (EN) and `README-JA.md` (JA) for user-facing changes.
6. Record architectural decisions in `docs/adr/` when appropriate.

## Reporting Bugs

Use the [bug report template](https://github.com/hjmsano/frostpillar-btree/issues/new?template=bug_report.yml) on GitHub Issues.

## Suggesting Features

Use the [feature request template](https://github.com/hjmsano/frostpillar-btree/issues/new?template=feature_request.yml) on GitHub Issues.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
