import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, type EntryId } from '../src/index.js';

const numCmp = (left: number, right: number): number => left - right;

// With maxLeafEntries <= 8 the lazy threshold Math.max(1, Math.ceil(min / 4))
// reaches 1, so a leaf can legally be drained to zero entries before the
// rebalance path refills it from a sibling. Ancestor cached min keys must be
// refreshed when that happens (spec sections 4.1 and 5).
const smallLazyTree = (
  overrides: { enableEntryIdLookup?: boolean } = {},
): InMemoryBTree<number, number> =>
  new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
    deleteRebalancePolicy: 'lazy',
    ...overrides,
  });

// --- Regression: emptied leaf refilled from right sibling ---

void test('lazy policy: popFirst drain keeps ancestor cached keys consistent', (): void => {
  const tree = smallLazyTree();
  for (let i = 0; i < 40; i += 1) tree.put(i, i);

  for (let i = 0; i < 40; i += 1) {
    const popped = tree.popFirst();
    assert.notEqual(popped, null);
    assert.equal(popped!.key, i);
    tree.assertInvariants();
  }
  assert.equal(tree.size(), 0);
});

void test('lazy policy: popFirst drain keeps invariants at threshold boundary capacity 8', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    maxLeafEntries: 8,
    maxBranchChildren: 8,
    deleteRebalancePolicy: 'lazy',
  });
  for (let i = 0; i < 80; i += 1) tree.put(i, i);

  for (let i = 0; i < 80; i += 1) {
    const popped = tree.popFirst();
    assert.notEqual(popped, null);
    assert.equal(popped!.key, i);
    tree.assertInvariants();
  }
  assert.equal(tree.size(), 0);
});

void test('lazy policy: remove draining a middle leaf keeps invariants', (): void => {
  const tree = smallLazyTree();
  for (let i = 0; i < 40; i += 1) tree.put(i, i);

  const removalOrder = [10, 11, 12, 13, 9, 8, 14, 15, 16, 17];
  for (const key of removalOrder) {
    const removed = tree.remove(key);
    assert.notEqual(removed, null);
    assert.equal(removed!.key, key);
    tree.assertInvariants();
  }

  assert.equal(tree.size(), 30);
  for (let i = 0; i < 40; i += 1) {
    const expected = removalOrder.includes(i) ? null : i;
    assert.equal(tree.get(i), expected);
  }
});

void test('lazy policy: removeById drain keeps invariants', (): void => {
  const tree = smallLazyTree({ enableEntryIdLookup: true });
  const ids: EntryId[] = [];
  for (let i = 0; i < 40; i += 1) ids.push(tree.put(i, i));

  for (let i = 0; i < 40; i += 1) {
    const removed = tree.removeById(ids[i]);
    assert.notEqual(removed, null);
    assert.equal(removed!.key, i);
    tree.assertInvariants();
  }
  assert.equal(tree.size(), 0);
});

void test('lazy policy: deleteRange emptying whole leaves keeps invariants', (): void => {
  const tree = smallLazyTree();
  for (let i = 0; i < 60; i += 1) tree.put(i, i);

  const deleted = tree.deleteRange(8, 39);
  assert.equal(deleted, 32);
  assert.equal(tree.size(), 28);
  tree.assertInvariants();

  assert.equal(tree.get(7), 7);
  assert.equal(tree.get(8), null);
  assert.equal(tree.get(39), null);
  assert.equal(tree.get(40), 40);
});

void test('standard policy: deleteRange emptying whole leaves keeps invariants', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });
  for (let i = 0; i < 60; i += 1) tree.put(i, i);

  const deleted = tree.deleteRange(8, 39);
  assert.equal(deleted, 32);
  assert.equal(tree.size(), 28);
  tree.assertInvariants();
});

// --- Regression: deterministic interleaved fuzz against a reference Map ---

const lcgNext = (seed: number): number => (1664525 * seed + 1013904223) >>> 0;

void test('lazy policy: seeded interleaved put/remove keeps invariants and correctness', (): void => {
  const tree = smallLazyTree();
  const reference = new Map<number, number>();
  const keySpace = 200;
  let seed = 12345;
  const nextFraction = (): number => {
    seed = lcgNext(seed);
    return seed / 2 ** 32;
  };

  for (let i = 0; i < keySpace; i += 1) {
    tree.put(i, i);
    reference.set(i, i);
  }

  // Without the emptied-leaf ancestor key refresh, this trajectory corrupts
  // the cached min keys within the first 200 steps.
  for (let step = 0; step < 1000; step += 1) {
    const key = Math.floor(nextFraction() * keySpace);
    if (nextFraction() < 0.5) {
      tree.remove(key);
      reference.delete(key);
      assert.equal(tree.get(key), null);
    } else {
      tree.put(key, key);
      reference.set(key, key);
      assert.equal(tree.get(key), key);
    }
    tree.assertInvariants();
    assert.equal(tree.size(), reference.size);
  }
});
