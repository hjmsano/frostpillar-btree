# Vision and Principles

Status: Active
Last Updated: 2026-03-09

## Purpose

Build a tiny, dependency-light, reusable in-memory B+ tree package that runs in Node.js and browser JavaScript environments.

## Product goals

- Small and fast: low overhead, predictable operations.
- Reusable: not coupled to Frostpillar datastore internals.
- Type-safe: strict TypeScript, no `any`.
- Deterministic: ordered traversal and stable behavior under split/merge.

## Engineering principles

- Spec-driven and test-driven workflow is mandatory.
- Keep public API minimal and named-export only.
- Avoid dependencies when platform primitives are sufficient.
- Separate structural invariants from mutation/query logic.
- Prefer explicit typed errors over silent recovery.

## Non-goals (current scope)

- Persistent storage adapters
- Distributed consensus across multiple machines
- SQL/Lucene based query support

## Runtime baseline

- Node.js 24.x
- TypeScript 5.x
- ESM modules
