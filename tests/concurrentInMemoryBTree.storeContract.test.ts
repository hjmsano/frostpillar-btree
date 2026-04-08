import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeConcurrencyError,
  ConcurrentInMemoryBTree,
  type SharedTreeStore,
} from '../src/index.js';
import {
  AtomicMemorySharedTreeStore,
  AppliedWithoutVersionAdvanceStore,
  RegressedConflictVersionStore,
} from './helpers/sharedTreeStoreStubs.js';

void test('throws when append reports applied=true without version advance', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new AppliedWithoutVersionAdvanceStore<number, string>(),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.put(1, 'one');
  }, BTreeConcurrencyError);
});

void test('throws when append reports applied=false with regressed store version', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new RegressedConflictVersionStore<number, string>(),
  });

  await tree.put(1, 'one');

  await assert.rejects(async (): Promise<void> => {
    await tree.put(2, 'two');
  }, BTreeConcurrencyError);
});

void test('immediately corrupts instance when append succeeds but local apply fails', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const applyFailMessage = 'intentional comparator failure during local apply';
  const brokenComparatorTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (
        (left === 1 && right === 2)
        || (left === 2 && right === 1)
      ) {
        throw new Error(applyFailMessage);
      }
      return left - right;
    },
    duplicateKeys: 'allow',
    store,
  });
  const healthyComparatorTree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'allow',
    store,
  });

  await healthyComparatorTree.put(1, 'one');

  // The local apply failure after successful append must be wrapped as BTreeConcurrencyError
  // and must include the original error message for debugging.
  await assert.rejects(async (): Promise<void> => {
    await brokenComparatorTree.put(2, 'two');
  }, (error: unknown): boolean => {
    assert.ok(error instanceof BTreeConcurrencyError, 'must be BTreeConcurrencyError');
    assert.ok(
      error.message.includes(applyFailMessage),
      `must include original error message, got: ${error.message}`,
    );
    return true;
  });

  // The healthy instance still works — the store-side mutation was appended successfully.
  const healthySnapshot = await healthyComparatorTree.snapshot();
  assert.equal(healthySnapshot.length, 2);
  assert.equal(healthySnapshot[0].key, 1);
  assert.equal(healthySnapshot[0].value, 'one');
  assert.equal(healthySnapshot[1].key, 2);
  assert.equal(healthySnapshot[1].value, 'two');

  // The broken instance is immediately corrupted — no need for a second operation to detect it.
  await assert.rejects(async (): Promise<void> => {
    await brokenComparatorTree.snapshot();
  }, BTreeConcurrencyError);

  // Writes are also blocked.
  await assert.rejects(async (): Promise<void> => {
    await brokenComparatorTree.put(3, 'three');
  }, BTreeConcurrencyError);
});

void test('throws when append returns non-bigint version', async (): Promise<void> => {
  const malformedAppendStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () => Promise.resolve({ version: 0n, mutations: [] }),
    append: () =>
      Promise.resolve(
        { applied: true, version: 1 } as unknown as { applied: boolean; version: bigint },
      ),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: malformedAppendStore,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.put(1, 'one');
  }, BTreeConcurrencyError);
});

void test('throws when append returns non-boolean applied flag', async (): Promise<void> => {
  const malformedAppendStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () => Promise.resolve({ version: 0n, mutations: [] }),
    append: () =>
      Promise.resolve(
        { applied: 'yes', version: 1n } as unknown as { applied: boolean; version: bigint },
      ),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: malformedAppendStore,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.put(1, 'one');
  }, BTreeConcurrencyError);
});

void test('throws when sync mutation batch exceeds maxSyncMutationsPerBatch', async (): Promise<void> => {
  const oversizedBatchStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () =>
      Promise.resolve({
        version: 1n,
        mutations: [
          { type: 'put', key: 1, value: 'one' },
          { type: 'put', key: 2, value: 'two' },
        ],
      }),
    append: () => Promise.resolve({ applied: false, version: 1n }),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: oversizedBatchStore,
    maxSyncMutationsPerBatch: 1,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

// ===========================================================================
// Store contract: getLogEntriesSince edge cases
// ===========================================================================

void test('throws when getLogEntriesSince returns non-bigint version', async (): Promise<void> => {
  const malformedStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () =>
      Promise.resolve({ version: 1, mutations: [] } as unknown as { version: bigint; mutations: [] }),
    append: () => Promise.resolve({ applied: false, version: 0n }),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: malformedStore,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('throws when getLogEntriesSince returns non-array mutations', async (): Promise<void> => {
  const malformedStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () =>
      Promise.resolve({ version: 1n, mutations: 'not-an-array' } as unknown as { version: bigint; mutations: [] }),
    append: () => Promise.resolve({ applied: false, version: 0n }),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: malformedStore,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('sync with exactly maxSyncMutationsPerBatch mutations succeeds', async (): Promise<void> => {
  const batchSize = 3;
  const exactBatchStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: (version: bigint) => {
      if (version >= 1n) return Promise.resolve({ version: 1n, mutations: [] });
      return Promise.resolve({
        version: 1n,
        mutations: [
          { type: 'init' as const, configFingerprint: '{"duplicateKeys":"replace","maxLeafEntries":64,"maxBranchChildren":64,"enableEntryIdLookup":false,"autoScale":false}' },
          { type: 'put' as const, key: 1, value: 'one' },
          { type: 'put' as const, key: 2, value: 'two' },
        ],
      });
    },
    append: () => Promise.resolve({ applied: false, version: 1n }),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: exactBatchStore,
    maxSyncMutationsPerBatch: batchSize,
  });

  // Should NOT throw — exactly at the limit
  await tree.sync();
  assert.equal(await tree.size(), 2);
});

void test('sync ignores log with version <= currentVersion (stale read)', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await tree.put(1, 'one');
  // Sync again — store returns same version — should be a no-op
  await tree.sync();
  assert.equal(await tree.size(), 1);
});

void test('throws when append returns null/undefined as result', async (): Promise<void> => {
  const nullAppendStore: SharedTreeStore<number, string> = {
    getLogEntriesSince: () => Promise.resolve({ version: 0n, mutations: [] }),
    append: () => Promise.resolve(null as unknown as { applied: boolean; version: bigint }),
  };

  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: nullAppendStore,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.put(1, 'one');
  }, BTreeConcurrencyError);
});

// ===========================================================================
// Store contract: version jump scenarios
// ===========================================================================

void test('handles version jump > 1 from store append', async (): Promise<void> => {
  // JumpVersionStore already increments by 10 — verify tree handles this
  const { JumpVersionStore } = await import('./helpers/sharedTreeStoreStubs.js');
  const store = new JumpVersionStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const id1 = await tree.put(1, 'one');
  const id2 = await tree.put(2, 'two');
  assert.equal(await tree.size(), 2);
  assert.deepEqual(await tree.range(1, 2), [
    { entryId: id1, key: 1, value: 'one' },
    { entryId: id2, key: 2, value: 'two' },
  ]);
});
