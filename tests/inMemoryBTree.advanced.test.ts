import assert from 'node:assert/strict';
import test from 'node:test';

import { type EntryId, InMemoryBTree } from '../src/index.js';

void test('remove on single-entry tree yields empty tree with valid state', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });
  const id = tree.put(42, 'only');
  assert.deepEqual(tree.remove(42), { entryId: id, key: 42, value: 'only' });
  assert.equal(tree.size(), 0);
  assert.equal(tree.peekFirst(), null);
  assert.equal(tree.peekLast(), null);
  assert.equal(tree.popFirst(), null);
  assert.equal(tree.popLast(), null);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();
  // Re-insert works correctly
  tree.put(1, 'new');
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('alternating popFirst and popLast drains tree correctly', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });
  for (let i = 1; i <= 10; i += 1) tree.put(i, `v${i}`);

  // Pop from both ends alternately
  assert.equal(tree.popFirst()!.key, 1);
  assert.equal(tree.popLast()!.key, 10);
  assert.equal(tree.popFirst()!.key, 2);
  assert.equal(tree.popLast()!.key, 9);
  assert.equal(tree.popFirst()!.key, 3);
  assert.equal(tree.popLast()!.key, 8);
  assert.equal(tree.popFirst()!.key, 4);
  assert.equal(tree.popLast()!.key, 7);
  assert.equal(tree.popFirst()!.key, 5);
  assert.equal(tree.popLast()!.key, 6);
  assert.equal(tree.popFirst(), null);
  assert.equal(tree.popLast(), null);
  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('snapshot returns a detached copy — mutations to array do not affect tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });
  tree.put(1, 'a');
  tree.put(2, 'b');

  const snap = tree.snapshot();
  snap.length = 0; // mutate the returned array
  assert.equal(tree.size(), 2); // tree unaffected
  assert.equal(tree.snapshot().length, 2);
});

void test('remove then re-insert same key works correctly', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    enableEntryIdLookup: true,
  });
  const id1 = tree.put(5, 'first');
  tree.remove(5);
  assert.equal(tree.get(5), null);
  assert.equal(tree.peekById(id1), null);

  const id2 = tree.put(5, 'second');
  assert.notEqual(id1, id2);
  assert.equal(tree.get(5), 'second');
  assert.deepEqual(tree.peekById(id2), {
    entryId: id2,
    key: 5,
    value: 'second',
  });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Negative, float, and boundary key tests
// ---------------------------------------------------------------------------

void test('negative keys are ordered correctly', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  tree.put(-10, 'neg10');
  tree.put(-5, 'neg5');
  tree.put(0, 'zero');
  tree.put(5, 'pos5');
  tree.put(-20, 'neg20');

  const keys = [...tree.keys()];
  assert.deepEqual(keys, [-20, -10, -5, 0, 5]);

  assert.equal(tree.get(-10), 'neg10');
  assert.equal(tree.get(0), 'zero');
  assert.deepEqual(
    tree.range(-10, 0).map((e) => e.key),
    [-10, -5, 0],
  );
  tree.assertInvariants();
});

void test('float keys are ordered correctly', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  tree.put(0.1, 'a');
  tree.put(0.01, 'b');
  tree.put(-0.5, 'c');
  tree.put(1.5, 'd');
  tree.put(0.1 + 0.2, 'e'); // ~0.3

  const keys = [...tree.keys()];
  for (let i = 1; i < keys.length; i += 1) {
    assert.ok(
      keys[i - 1] < keys[i],
      `float key order violation: ${keys[i - 1]} >= ${keys[i]}`,
    );
  }
  assert.equal(tree.size(), 5);
  tree.assertInvariants();
});

void test('removeById on first entry of a non-root leaf triggers updateMinKeyInAncestors and rebalance', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    enableEntryIdLookup: true,
  });

  // Insert enough entries to create a multi-leaf tree with height > 1.
  // With maxLeafEntries=3 and maxBranchChildren=3, 12 entries produce several leaves.
  const ids: EntryId[] = [];
  for (let i = 1; i <= 12; i += 1) {
    ids.push(tree.put(i, `v${i}`));
  }
  tree.assertInvariants();
  const sizeBefore = tree.size();
  assert.equal(sizeBefore, 12);

  // Take a snapshot to find the first entry of a non-leftmost leaf.
  // We know the tree has multiple leaves; entries are sorted 1..12.
  // With maxLeafEntries=3 the first leaf holds roughly keys 1,2 (after splits)
  // and the second leaf starts at some key > 2.
  // Strategy: remove entries from the START of a non-root leaf by targeting
  // keys that sit at a leaf boundary. We remove enough so minLeafEntries (2)
  // is violated, triggering rebalance. Removing the first entry (index=0)
  // triggers updateMinKeyInAncestors.

  // First, remove key=4 by id — this is likely the first entry in a leaf.
  // If it isn't, the logic still exercises removeById; but to reliably hit
  // index=0 in a non-root leaf, we remove consecutive keys from the same leaf.
  // With maxLeafEntries=3, minLeafEntries=2, removing 1 entry from a leaf
  // that has exactly 2 entries triggers rebalance.

  // Remove keys from the front of the tree to drain the first leaf and
  // shift boundaries, then target the new first entry of the second leaf.
  // Removing key=1 (first entry in the leftmost leaf, index=0, non-null parent
  // if height > 1) triggers line 222. If the leaf underflows, line 225 fires.
  const removed1 = tree.removeById(ids[0]); // key=1
  assert.deepEqual(removed1, { entryId: ids[0], key: 1, value: 'v1' });
  tree.assertInvariants();

  const removed2 = tree.removeById(ids[1]); // key=2
  assert.deepEqual(removed2, { entryId: ids[1], key: 2, value: 'v2' });
  tree.assertInvariants();

  // Now remove key=3 — after removing 1 and 2, key=3 should be the first
  // entry in a leaf. With only 1 entry left in that leaf after removal of 2,
  // the leaf already underflowed, so rebalance may have reorganized.
  // Either way, we keep removing to exercise the paths.
  const removed3 = tree.removeById(ids[2]); // key=3
  assert.deepEqual(removed3, { entryId: ids[2], key: 3, value: 'v3' });
  tree.assertInvariants();

  assert.equal(tree.size(), sizeBefore - 3);
  assert.equal(tree.get(1), null);
  assert.equal(tree.get(2), null);
  assert.equal(tree.get(3), null);
  assert.equal(tree.get(4), 'v4');

  // Verify remaining entries are intact and ordered
  const snap = tree.snapshot();
  assert.equal(snap.length, 9);
  for (let i = 1; i < snap.length; i += 1) {
    assert.ok(snap[i - 1].key < snap[i].key);
  }
});

void test('mixed negative and positive keys with range, delete, and navigation', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  for (let i = -15; i <= 15; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.size(), 31);
  assert.equal(tree.get(-15), 'v-15');
  assert.equal(tree.get(15), 'v15');

  // Range across zero
  const rangeAcrossZero = tree.range(-2, 2);
  assert.deepEqual(
    rangeAcrossZero.map((e) => e.key),
    [-2, -1, 0, 1, 2],
  );

  // Delete negative range
  assert.equal(tree.deleteRange(-15, -10), 6);
  assert.equal(tree.size(), 25);
  assert.equal(tree.get(-15), null);
  assert.equal(tree.get(-9), 'v-9');

  // Navigation across zero
  assert.equal(tree.nextHigherKey(-1), 0);
  assert.equal(tree.nextLowerKey(1), 0);

  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Internal optimization path coverage
// ---------------------------------------------------------------------------

void test('leafInsertAt first-half gap-fill: popFirst then insert into leftmost leaf', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });

  // Fill a single leaf to capacity
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  // popFirst removes key=1 and increments entryOffset on the leftmost leaf
  assert.deepEqual(tree.popFirst()!.key, 1);

  // Insert key=0 — goes to the leftmost leaf at logicalIndex=0 (before key=2).
  // entryOffset > 0 and logicalIndex < count/2 → gap-fill path fires (lines 254-257).
  tree.put(0, 'v0');

  assert.equal(tree.size(), 4);
  assert.deepEqual(
    tree.snapshot().map((e) => e.key),
    [0, 2, 3, 4],
  );
  tree.assertInvariants();
});

void test('leafCompact triggered during split: popFirst then overflow the same leaf', (): void => {
  // Use maxLeafEntries=4 so that popFirst creates entryOffset=1 without
  // triggering auto-compaction (offset 1 < length 4 >>> 1 = 2).
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });

  // Fill a single leaf to capacity (4 entries)
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  // popFirst removes key=1. leafShiftEntry: offset=1, length=4.
  // 1 < (4 >>> 1)=2 → NO auto-compact. entryOffset stays at 1.
  assert.deepEqual(tree.popFirst()!.key, 1);

  // Insert 5 and 6: count goes 3 → 4 → 5, exceeds maxLeafEntries=4.
  // splitLeaf calls leafCompact with entryOffset=1 > 0 → lines 267-270 fire.
  tree.put(5, 'v5');
  tree.put(6, 'v6');

  assert.equal(tree.size(), 5);
  assert.deepEqual(
    tree.snapshot().map((e) => e.key),
    [2, 3, 4, 5, 6],
  );
  tree.assertInvariants();
});
