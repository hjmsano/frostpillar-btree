import { computeAutoScaleTier } from '../btree/autoScale.js';
import {
  DEFAULT_MAX_BRANCH_CHILDREN,
  DEFAULT_MAX_LEAF_ENTRIES,
} from '../btree/types.js';
import { BTreeConcurrencyError } from '../errors.js';
import type {
  BTreeMutation,
  ConcurrentInMemoryBTreeConfig,
  ReadMode,
} from './types.js';
import type { BTreeEntry, EntryId } from '../InMemoryBTree.js';

const DEFAULT_MAX_RETRIES = 16;
const MAX_RETRIES_LIMIT = 1024;
const DEFAULT_MAX_SYNC_MUTATIONS_PER_BATCH = 100_000;
const MAX_SYNC_MUTATIONS_PER_BATCH_LIMIT = 1_000_000;

export const computeConfigFingerprint = <TKey>(
  config: ConcurrentInMemoryBTreeConfig<TKey, unknown>,
): string => {
  const isAutoScale = config.autoScale === true;
  const tier0 = isAutoScale ? computeAutoScaleTier(0) : undefined;
  return JSON.stringify({
    duplicateKeys: config.duplicateKeys ?? 'replace',
    maxLeafEntries:
      config.maxLeafEntries ??
      (tier0 ? tier0.maxLeaf : DEFAULT_MAX_LEAF_ENTRIES),
    maxBranchChildren:
      config.maxBranchChildren ??
      (tier0 ? tier0.maxBranch : DEFAULT_MAX_BRANCH_CHILDREN),
    enableEntryIdLookup: config.enableEntryIdLookup === true,
    autoScale: isAutoScale,
  });
};

export type MutationResult<
  TKey,
  TValue,
  TMutation extends BTreeMutation<TKey, TValue>,
> = TMutation extends { type: 'init' }
  ? null
  : TMutation extends { type: 'put' }
    ? EntryId
    : TMutation extends { type: 'putMany' }
      ? EntryId[]
      : TMutation extends { type: 'remove' }
        ? BTreeEntry<TKey, TValue> | null
        : TMutation extends { type: 'removeById' }
          ? BTreeEntry<TKey, TValue> | null
          : TMutation extends { type: 'updateById' }
            ? BTreeEntry<TKey, TValue> | null
            : TMutation extends { type: 'popFirst' }
              ? BTreeEntry<TKey, TValue> | null
              : TMutation extends { type: 'popLast' }
                ? BTreeEntry<TKey, TValue> | null
                : TMutation extends { type: 'deleteRange' }
                  ? number
                  : TMutation extends { type: 'clear' }
                    ? null
                    : never;

export type AnyMutationResult<TKey, TValue> =
  | EntryId
  | EntryId[]
  | BTreeEntry<TKey, TValue>
  | number
  | null;

export const assertNeverMutation = (mutation: never): never => {
  const unknownMutation = mutation as { type?: unknown };
  throw new BTreeConcurrencyError(
    `Unsupported mutation type from shared store: ${String(unknownMutation.type)}`,
  );
};

const validatePutManyEntries = (entries: unknown[]): void => {
  for (const entry of entries) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('key' in entry) ||
      !('value' in entry)
    ) {
      throw new BTreeConcurrencyError(
        'Malformed putMany mutation: each entry must have key and value.',
      );
    }
  }
};

const validateInitMutation = (
  m: Record<string, unknown>,
  expectedConfigFingerprint: string | undefined,
): void => {
  if (typeof m.configFingerprint !== 'string') {
    throw new BTreeConcurrencyError(
      'Malformed init mutation: missing configFingerprint.',
    );
  }
  if (
    expectedConfigFingerprint !== undefined &&
    m.configFingerprint !== expectedConfigFingerprint
  ) {
    throw new BTreeConcurrencyError(
      'Config mismatch: store peers must share identical tree config.',
    );
  }
};

const validateMutationFields = (m: Record<string, unknown>): void => {
  switch (m.type) {
    case 'put':
      if (!('key' in m) || !('value' in m)) {
        throw new BTreeConcurrencyError(
          'Malformed put mutation: missing key or value.',
        );
      }
      break;
    case 'remove':
      if (!('key' in m)) {
        throw new BTreeConcurrencyError(
          'Malformed remove mutation: missing key.',
        );
      }
      break;
    case 'removeById':
      if (!('entryId' in m)) {
        throw new BTreeConcurrencyError(
          'Malformed removeById mutation: missing entryId.',
        );
      }
      break;
    case 'updateById':
      if (!('entryId' in m) || !('value' in m)) {
        throw new BTreeConcurrencyError(
          'Malformed updateById mutation: missing entryId or value.',
        );
      }
      break;
    case 'putMany':
      if (!('entries' in m) || !Array.isArray(m.entries)) {
        throw new BTreeConcurrencyError(
          'Malformed putMany mutation: missing entries array.',
        );
      }
      validatePutManyEntries(m.entries as unknown[]);
      break;
    case 'deleteRange':
      if (!('startKey' in m) || !('endKey' in m)) {
        throw new BTreeConcurrencyError(
          'Malformed deleteRange mutation: missing startKey or endKey.',
        );
      }
      break;
    default:
      break;
  }
};

const validateSingleMutation = (
  m: Record<string, unknown>,
  expectedConfigFingerprint: string | undefined,
): void => {
  switch (m.type) {
    case 'init':
      validateInitMutation(m, expectedConfigFingerprint);
      break;
    case 'put':
    case 'remove':
    case 'removeById':
    case 'updateById':
    case 'putMany':
    case 'deleteRange':
      validateMutationFields(m);
      break;
    case 'popFirst':
    case 'popLast':
    case 'clear':
      break;
    default:
      throw new BTreeConcurrencyError(
        `Unsupported mutation type from shared store: ${String(m.type)}`,
      );
  }
};

export const validateMutationBatch = <TKey, TValue>(
  mutations: BTreeMutation<TKey, TValue>[],
  expectedConfigFingerprint?: string,
): void => {
  for (const mutation of mutations) {
    if (typeof mutation !== 'object' || mutation === null) {
      throw new BTreeConcurrencyError(
        'Malformed mutation: expected an object.',
      );
    }
    validateSingleMutation(
      mutation as Record<string, unknown>,
      expectedConfigFingerprint,
    );
  }
};

export const normalizeMaxRetries = (value: number | undefined): number => {
  if (value === undefined) {
    return DEFAULT_MAX_RETRIES;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_RETRIES_LIMIT) {
    throw new BTreeConcurrencyError(
      `maxRetries: integer 1–${MAX_RETRIES_LIMIT} required.`,
    );
  }

  return value;
};

export const normalizeMaxSyncMutationsPerBatch = (
  value: number | undefined,
): number => {
  if (value === undefined) {
    return DEFAULT_MAX_SYNC_MUTATIONS_PER_BATCH;
  }

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SYNC_MUTATIONS_PER_BATCH_LIMIT
  ) {
    throw new BTreeConcurrencyError(
      `maxSyncMutationsPerBatch: integer 1–${MAX_SYNC_MUTATIONS_PER_BATCH_LIMIT} required.`,
    );
  }

  return value;
};

export const normalizeReadMode = (value: ReadMode | undefined): ReadMode => {
  if (value === undefined) {
    return 'strong';
  }
  if (value !== 'strong' && value !== 'local') {
    throw new BTreeConcurrencyError(`readMode: must be 'strong' or 'local'.`);
  }
  return value;
};

export function assertAppendVersionContract(
  expectedVersion: bigint,
  appendResult: unknown,
): asserts appendResult is { applied: boolean; version: bigint } {
  if (typeof appendResult !== 'object' || appendResult === null) {
    throw new BTreeConcurrencyError(
      'Store contract: append() must return {applied, version}.',
    );
  }
  const candidate = appendResult as { applied?: unknown; version?: unknown };
  if (typeof candidate.applied !== 'boolean') {
    throw new BTreeConcurrencyError('Store contract: applied must be boolean.');
  }
  if (typeof candidate.version !== 'bigint') {
    throw new BTreeConcurrencyError('Store contract: version must be bigint.');
  }

  if (candidate.applied && candidate.version <= expectedVersion) {
    throw new BTreeConcurrencyError(
      'Store contract: applied version must exceed expected.',
    );
  }

  if (!candidate.applied && candidate.version < expectedVersion) {
    throw new BTreeConcurrencyError(
      'Store contract: rejected version must be >= expected.',
    );
  }
}
