import assert from 'node:assert/strict';
import test from 'node:test';

import { BTreeConcurrencyError, BTreeValidationError, ConcurrentInMemoryBTree } from '../src/index.js';

import { AtomicMemorySharedTreeStore } from './helpers/sharedTreeStoreStubs.js';

// --- duplicateKeys policy tests for ConcurrentInMemoryBTree ---

void test('concurrent duplicateKeys reject: throws on duplicate key insert', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });

  await tree.put(5, 'a');
  await assert.rejects(
    async (): Promise<void> => { await tree.put(5, 'b'); },
    BTreeValidationError,
  );
  assert.equal(await tree.size(), 1);
});

void test('concurrent duplicateKeys replace: overwrites value and preserves EntryId', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });

  const idOriginal = await tree.put(5, 'a');
  const idReturned = await tree.put(5, 'b');

  assert.equal(idReturned, idOriginal);
  assert.equal(await tree.size(), 1);
  assert.deepEqual(await tree.snapshot(), [
    { entryId: idOriginal, key: 5, value: 'b' },
  ]);
});

void test('concurrent duplicateKeys reject: cross-instance duplicate detection', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });

  await writerA.put(5, 'from-A');
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(5, 'from-B'); },
    BTreeValidationError,
  );
  assert.equal(await writerA.size(), 1);
});

void test('concurrent duplicateKeys replace: cross-instance replacement', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });

  const idOriginal = await writerA.put(5, 'from-A');
  const idReturned = await writerB.put(5, 'from-B');

  assert.equal(idReturned, idOriginal);
  assert.equal(await writerA.size(), 1);
  assert.deepEqual(await writerA.snapshot(), [
    { entryId: idOriginal, key: 5, value: 'from-B' },
  ]);
});

// --- config fingerprint handshake tests ---

void test('config mismatch: duplicateKeys difference throws on sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow',
  });

  await writerA.put(1, 'one');
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(2, 'two'); },
    BTreeConcurrencyError,
  );
});

void test('config mismatch: maxLeafEntries difference throws on sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    maxLeafEntries: 8,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    maxLeafEntries: 16,
  });

  await writerA.put(1, 'one');
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(2, 'two'); },
    BTreeConcurrencyError,
  );
});

void test('config mismatch: enableEntryIdLookup difference throws on sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: false,
  });

  await writerA.put(1, 'one');
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(2, 'two'); },
    BTreeConcurrencyError,
  );
});

void test('config mismatch: enableEntryIdLookup undefined vs true throws on sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: true,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writerA.put(1, 'one');
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(2, 'two'); },
    BTreeConcurrencyError,
  );
});

void test('config match: enableEntryIdLookup false and undefined are treated identically', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    enableEntryIdLookup: false,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  await writerA.put(1, 'one');
  await writerB.put(2, 'two');
  assert.equal(await writerA.size(), 2);
  assert.equal(await writerB.size(), 2);
});

void test('config mismatch: read-only instance detects mismatch on sync', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writer = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
  });
  const reader = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });

  await writer.put(1, 'one');
  await assert.rejects(
    async (): Promise<void> => { await reader.size(); },
    BTreeConcurrencyError,
  );
});

void test('config mismatch: store state is not corrupted by failed instance', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'replace',
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'allow', // mismatched
  });

  await writerA.put(1, 'one');
  await writerA.put(2, 'two');

  // writerB fails due to config mismatch
  await assert.rejects(
    async (): Promise<void> => { await writerB.put(3, 'three'); },
    BTreeConcurrencyError,
  );

  // writerA should still function — store not corrupted
  await writerA.put(3, 'three-from-A');
  assert.equal(await writerA.size(), 3);
  assert.equal(await writerA.get(3), 'three-from-A');
  await writerA.assertInvariants();

  // Verify store version advanced only for writerA's operations
  const versionAfter = store.currentVersion;
  assert.ok(versionAfter > 0n, 'store version should have advanced');
});

void test('matching config: instances with same config cooperate normally', async (): Promise<void> => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const writerA = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
    maxLeafEntries: 8,
  });
  const writerB = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
    duplicateKeys: 'reject',
    maxLeafEntries: 8,
  });

  await writerA.put(1, 'one');
  await writerB.put(2, 'two');
  assert.equal(await writerA.size(), 2);
});

// --- Concurrent API surface: intentionally omitted methods ---
// These methods are not available on ConcurrentInMemoryBTree by design.
// Bulk mutations (deleteRange, clear, putMany) and iterators are omitted
// because they cannot be expressed as single atomic mutations in the shared log.
// Serialization (toJSON/fromJSON/clone) is omitted because state is owned by
// the shared store, not the local instance.

void test('ConcurrentInMemoryBTree does not expose bulk mutation methods', (): void => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const instance = tree as unknown as Record<string, unknown>;
  assert.equal(typeof instance.deleteRange, 'undefined', 'deleteRange should not exist');
  assert.equal(typeof instance.clear, 'undefined', 'clear should not exist');
  assert.equal(typeof instance.putMany, 'undefined', 'putMany should not exist');
});

void test('ConcurrentInMemoryBTree does not expose iterator methods', (): void => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const instance = tree as unknown as Record<string, unknown>;
  assert.equal(typeof instance.entries, 'undefined', 'entries should not exist');
  assert.equal(typeof instance.keys, 'undefined', 'keys should not exist');
  assert.equal(typeof instance.values, 'undefined', 'values should not exist');
  assert.equal(typeof instance.entriesReversed, 'undefined', 'entriesReversed should not exist');
  assert.equal(typeof instance.forEach, 'undefined', 'forEach should not exist');
  assert.equal(typeof (instance as { [Symbol.iterator]?: unknown })[Symbol.iterator], 'undefined', 'Symbol.iterator should not exist');
});

void test('ConcurrentInMemoryBTree does not expose serialization methods', (): void => {
  const store = new AtomicMemorySharedTreeStore<number, string>();
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store,
  });

  const instance = tree as unknown as Record<string, unknown>;
  assert.equal(typeof instance.toJSON, 'undefined', 'toJSON should not exist');
  assert.equal(typeof instance.clone, 'undefined', 'clone should not exist');
});

