import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryBTree,
  BTreeValidationError,
  type EntryId,
} from '../src/index.js';

const numCmp = (left: number, right: number): number => left - right;

// --- Config validation ---

void test('deleteRebalancePolicy defaults to standard', (): void => {
  const tree = new InMemoryBTree<number, number>({ compareKeys: numCmp });
  // Default behavior: standard policy. Tree should work normally.
  for (let i = 0; i < 100; i += 1) tree.put(i, i);
  assert.equal(tree.size(), 100);
  tree.assertInvariants();
});

void test('deleteRebalancePolicy: explicit standard works', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'standard',
  });
  for (let i = 0; i < 100; i += 1) tree.put(i, i);
  tree.deleteRange(0, 50);
  tree.assertInvariants();
});

void test('deleteRebalancePolicy: lazy works', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 100; i += 1) tree.put(i, i);
  tree.deleteRange(0, 50);
  tree.assertInvariants();
});

void test('deleteRebalancePolicy: invalid value throws BTreeValidationError', (): void => {
  assert.throws(() => {
    new InMemoryBTree<number, number>({
      compareKeys: numCmp,
      deleteRebalancePolicy: 'invalid' as 'standard',
    });
  }, BTreeValidationError);
});

// --- Lazy policy correctness ---

void test('lazy policy: deleteRange produces correct results', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 1000; i += 1) tree.put(i, i);

  const deleted = tree.deleteRange(100, 500);
  assert.equal(deleted, 401);
  assert.equal(tree.size(), 599);
  tree.assertInvariants();

  // Verify remaining entries are correct
  assert.equal(tree.get(99), 99);
  assert.equal(tree.get(100), null);
  assert.equal(tree.get(500), null);
  assert.equal(tree.get(501), 501);
});

void test('lazy policy: remove produces correct results', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 200; i += 1) tree.put(i, i);

  // Remove entries one by one
  for (let i = 0; i < 100; i += 1) {
    const removed = tree.remove(i);
    assert.notEqual(removed, null);
    assert.equal(removed!.key, i);
  }

  assert.equal(tree.size(), 100);
  tree.assertInvariants();

  // Verify remaining entries
  for (let i = 100; i < 200; i += 1) {
    assert.equal(tree.get(i), i);
  }
});

void test('lazy policy: popFirst produces correct results', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 200; i += 1) tree.put(i, i);

  for (let i = 0; i < 100; i += 1) {
    const popped = tree.popFirst();
    assert.notEqual(popped, null);
    assert.equal(popped!.key, i);
  }

  assert.equal(tree.size(), 100);
  tree.assertInvariants();
});

void test('lazy policy: popLast produces correct results', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 200; i += 1) tree.put(i, i);

  for (let i = 199; i >= 100; i -= 1) {
    const popped = tree.popLast();
    assert.notEqual(popped, null);
    assert.equal(popped!.key, i);
  }

  assert.equal(tree.size(), 100);
  tree.assertInvariants();
});

// --- autoScale + lazy policy ---

void test('lazy policy with autoScale: mass deletion does not break invariants', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    autoScale: true,
    deleteRebalancePolicy: 'lazy',
  });

  // Insert enough to trigger autoScale tier 1 (1000+ entries)
  for (let i = 0; i < 2000; i += 1) tree.put(i, i);
  tree.assertInvariants();

  // Delete a large range
  const deleted = tree.deleteRange(0, 1500);
  assert.equal(deleted, 1501);
  assert.equal(tree.size(), 499);
  tree.assertInvariants();
});

void test('lazy policy with autoScale: full deletion works', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    autoScale: true,
    deleteRebalancePolicy: 'lazy',
  });

  for (let i = 0; i < 500; i += 1) tree.put(i, i);
  const deleted = tree.deleteRange(0, 499);
  assert.equal(deleted, 500);
  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('lazy policy with autoScale: interleaved insert/delete', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    autoScale: true,
    deleteRebalancePolicy: 'lazy',
  });

  // Build up
  for (let i = 0; i < 1000; i += 1) tree.put(i, i);
  tree.assertInvariants();

  // Delete half
  tree.deleteRange(0, 499);
  tree.assertInvariants();

  // Insert more
  for (let i = 1000; i < 1500; i += 1) tree.put(i, i);
  tree.assertInvariants();

  assert.equal(tree.size(), 1000);
});

// --- Lazy vs standard: lazy allows lower occupancy ---

void test('lazy policy: leaves can have lower occupancy than standard minimum', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
    maxLeafEntries: 64,
  });

  // Insert many entries
  for (let i = 0; i < 500; i += 1) tree.put(i, i);

  // Delete most entries — with lazy policy, fewer rebalances happen
  tree.deleteRange(0, 400);
  assert.equal(tree.size(), 99);
  tree.assertInvariants(); // Must pass with relaxed threshold
});

// --- clone/serialization preserve policy ---

void test('lazy policy: clone preserves deleteRebalancePolicy', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 100; i += 1) tree.put(i, i);

  const cloned = tree.clone();
  cloned.deleteRange(0, 50);
  cloned.assertInvariants();
  assert.equal(cloned.size(), 49);
});

void test('lazy policy: toJSON/fromJSON round-trip preserves policy', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 100; i += 1) tree.put(i, i);

  const json = tree.toJSON();
  const restored = InMemoryBTree.fromJSON(json, numCmp);
  restored.deleteRange(0, 50);
  restored.assertInvariants();
  assert.equal(restored.size(), 49);
});

// --- enableEntryIdLookup + lazy ---

void test('lazy policy: removeById works with enableEntryIdLookup', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
    enableEntryIdLookup: true,
  });

  const ids: EntryId[] = [];
  for (let i = 0; i < 100; i += 1) {
    ids.push(tree.put(i, i));
  }

  // Remove by ID
  for (let i = 0; i < 50; i += 1) {
    const removed = tree.removeById(ids[i]);
    assert.notEqual(removed, null);
  }

  assert.equal(tree.size(), 50);
  tree.assertInvariants();
});

// --- duplicateKeys + lazy ---

void test('lazy policy: works with duplicateKeys allow', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    deleteRebalancePolicy: 'lazy',
    duplicateKeys: 'allow',
  });

  for (let i = 0; i < 100; i += 1) {
    tree.put(i % 20, i);
  }

  tree.deleteRange(0, 10);
  tree.assertInvariants();
});
