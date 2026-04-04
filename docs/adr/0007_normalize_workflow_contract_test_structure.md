# ADR-0007: Normalize GitHub Actions Workflow Contract Test Structure

Status: Accepted
Date: 2026-03-11
Last Updated: 2026-03-11

## Context

`tests/githubActionsWorkflows.test.ts` had duplicated workflow-file reader helpers and mixed assertion styles.
Some checks were strict string includes while others were broad regex matches.
This made the test file harder to maintain and increased risk of either brittle failures or weak guarantees.

## Decision

1. Use one shared workflow file reader helper in the workflow contract test file.
2. Use a table-driven contract structure per workflow file (`fileName`, `testName`, and required assertions).
3. Use semantic regex assertions for required workflow behavior to tolerate formatting-only YAML changes.
4. Remove redundant file existence checks before `readFile`.

## Consequences

Positive:

- Less duplication in workflow contract tests.
- Consistent assertion style across CI and release workflow checks.
- Lower maintenance cost when workflow YAML formatting changes without behavior changes.

Trade-offs:

- Regex-based assertions require careful patterns to avoid false positives.
- The contract remains text-based instead of full YAML parsing.

## References

- https://nodejs.org/docs/latest/api/test.html
- https://nodejs.org/docs/latest/api/assert.html
- https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
