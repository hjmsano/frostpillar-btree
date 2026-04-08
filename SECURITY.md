# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Shared Store Trust Boundary

`ConcurrentInMemoryBTree` is designed for use with a **trusted** shared store. The following threats are out of scope for the library itself and must be handled at the application or infrastructure layer:

| Threat | Recommendation |
|--------|----------------|
| Untrusted store returning malformed mutations | Validate and sanitize store payloads before they reach the library |
| Oversized mutation batches causing resource exhaustion | Set `maxSyncMutationsPerBatch` and enforce store-level size limits |
| Replay poisoning via incompatible config mutations | Ensure all instances sharing a store use identical configuration |
| Instance corruption after replay failure | Treat a `BTreeConcurrencyError` from `sync()` as fatal; discard and recreate the instance |
| Multi-tenant data isolation | Enforce isolation at the store layer; the library does not namespace or isolate tenants |

For multi-tenant or publicly accessible deployments, the shared store's `append` and `getLogEntriesSince` endpoints must be protected with appropriate authentication and authorization before exposing them.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub's private vulnerability reporting](https://github.com/hjmsano/frostpillar-btree/security/advisories/new).

### What to include

- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested fix (optional)

You should receive a response within 7 days. We will work with you to understand and address the issue before any public disclosure.

## Disclosure Policy

- We will acknowledge receipt of your report promptly.
- We will confirm the vulnerability and determine affected versions.
- We will release a fix and publish a security advisory.
- We will credit reporters (unless anonymity is requested).
