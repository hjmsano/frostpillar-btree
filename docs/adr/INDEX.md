# ADR Index

## Active

- [0001: Standalone in-memory B+ tree](./0001_standalone_in_memory_btree.md)
- [0003: Serialize concurrent in-memory operations](./0003_serialize_concurrent_inmemory_operations.md)
- [0006: Document EntryId API surface](./0006_document_entryid_api_surface.md)
- [0007: Normalize workflow contract test structure](./0007_normalize_workflow_contract_test_structure.md)
- [0009: Enforce publish contract assertions in workflow tests](./0009_enforce_publish_contract_assertions_in_workflow_tests.md)
- [0010: Harden concurrent store contract and mutation validation](./0010_harden_concurrent_store_contract_and_mutation_validation.md)
- [0011: Add manual complexity benchmark runner](./0011_add_manual_complexity_benchmark_runner.md)
- [0012: Couple append/apply path and fail fast on invalid comparator behavior](./0012_couple_append_apply_and_fail_fast_comparator_contract.md)
- [0022: Consolidate release automation onto main branch](./0022_consolidate_release_automation_onto_main_branch.md)
- [0014: Optimize hot path and reduce footprint](./0014_optimize_hot_path_and_reduce_footprint.md)
- [0015: Single-pass put hot path and core bundle split](./0015_single_pass_insert_and_core_bundle_split.md)
- [0016: Prioritize API expansion with performance guardrails](./0016_prioritize_api_expansion_with_performance_guardrails.md)
- [0017: Deferred backlog checkpoint](./0017_deferred_backlog_checkpoint.md)
- [0018: Preserve autoScale restore state and harden input limits](./0018_preserve_autoscale_restore_state_and_harden_input_limits.md)
- [0019: Leaf array optimization and audit fixes](./0019_leaf_array_optimization_and_audit_fixes.md)
- [0020: Audit quick wins — validation, caching, and deduplication](./0020_audit_quick_wins.md)
- [0021: Concurrent read modes and performance optimizations](./0021_concurrent_read_modes_and_performance_optimizations.md)

## Superseded

- [0002: GitHub Actions CI/CD and GitHub Packages publish](./0002_github_actions_ci_cd_and_github_packages_publish.md) — superseded by 0004
- [0004: Release-driven CI/CD and publish trigger](./0004_release_driven_ci_cd_and_publish_trigger.md) — partially superseded by 0005, 0008
- [0005: Use `release.published` for publish trigger](./0005_release_event_type_published_for_package_publish.md) — superseded by 0008
- [0008: Single tag-push release and publish workflow](./0008_single_tag_push_release_and_publish_workflow.md) — superseded by 0013
- [0013: Adopt Release Please with release branch target and main default branch](./0013_adopt_release_please_for_protected_main_release_flow.md) — superseded by 0022
