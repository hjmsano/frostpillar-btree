import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ===========================================================================
// deleteRange() - regression: underfill leaf must be fully rebalanced
// ===========================================================================

void test('deleteRange: deleting first half of 10-key tree (maxLeafEntries:5) leaves valid structure', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 5,
    maxBranchChildren: 5,
  });
  for (let i = 0; i < 10; i += 1) {
    tree.put(i, `v${i}`);
  }
  const deleted = tree.deleteRange(0, 4);
  assert.equal(deleted, 5);
  assert.equal(tree.size(), 5);
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - leaf link consistency after full subtree removal
// ===========================================================================

void test('deleteRange works correctly after autoScale capacity growth', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (a, b) => a - b,
    autoScale: true,
  });
  for (let i = 0; i < 1100; i += 1) {
    tree.put(i, i);
  }
  const deleted = tree.deleteRange(100, 200);
  assert.equal(deleted, 101);
  assert.equal(tree.size(), 999);
  tree.assertInvariants();
});

void test('deleteRange() matches count() and range().length for all bound combinations', (): void => {
  const boundCombos: { lowerBound?: 'inclusive' | 'exclusive'; upperBound?: 'inclusive' | 'exclusive' }[] = [
    {},
    { lowerBound: 'inclusive' },
    { upperBound: 'inclusive' },
    { lowerBound: 'inclusive', upperBound: 'inclusive' },
    { lowerBound: 'exclusive' },
    { upperBound: 'exclusive' },
    { lowerBound: 'exclusive', upperBound: 'exclusive' },
    { lowerBound: 'inclusive', upperBound: 'exclusive' },
    { lowerBound: 'exclusive', upperBound: 'inclusive' },
  ];

  for (const opts of boundCombos) {
    const treeForCount = numTree();
    const treeForDelete = numTree();
    for (let i = 1; i <= 30; i += 1) {
      treeForCount.put(i, `v${i}`);
      treeForDelete.put(i, `v${i}`);
    }

    const rangeLen = treeForCount.range(10, 20, opts).length;
    const countResult = treeForCount.count(10, 20, opts);
    const deleteResult = treeForDelete.deleteRange(10, 20, opts);

    assert.equal(countResult, rangeLen, `count vs range().length mismatch for opts ${JSON.stringify(opts)}`);
    assert.equal(deleteResult, countResult, `deleteRange vs count mismatch for opts ${JSON.stringify(opts)}`);
    treeForDelete.assertInvariants();
  }
});

void test('deleteRange() preserves forward/backward traversal consistency', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  tree.deleteRange(10, 30);

  // Forward traversal via entries()
  const forwardKeys = [...tree.keys()];
  // Reverse traversal via entriesReversed()
  const reverseKeys = [...tree.entriesReversed()].map((e) => e.key);

  assert.deepEqual(forwardKeys, reverseKeys.reverse());
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - single-entry tree
// ===========================================================================

void test('deleteRange() deletes the only entry in a single-entry tree', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  assert.equal(tree.deleteRange(5, 5), 1);
  assert.equal(tree.size(), 0);
  assert.equal(tree.peekFirst(), null);
  assert.equal(tree.peekLast(), null);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();

  // Tree is usable after emptying
  tree.put(10, 'v10');
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(10), 'v10');
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - idempotency
// ===========================================================================

void test('deleteRange() second call on same range returns 0', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(3, 7), 5);
  assert.equal(tree.deleteRange(3, 7), 0);
  assert.equal(tree.size(), 5);
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - exclusive bounds + entryIdLookup combined
// ===========================================================================

void test('deleteRange() with exclusive lower bound cleans up entryIds correctly', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  const id1 = tree.put(1, 'v1');
  const id2 = tree.put(2, 'v2');
  const id3 = tree.put(3, 'v3');
  const id4 = tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { lowerBound: 'exclusive' }), 3);
  // id1 should survive (exclusive lower bound)
  assert.deepEqual(tree.peekById(id1), { entryId: id1, key: 1, value: 'v1' });
  // id2, id3, id4 should be removed from lookup map
  assert.equal(tree.peekById(id2), null);
  assert.equal(tree.peekById(id3), null);
  assert.equal(tree.peekById(id4), null);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('deleteRange() with exclusive upper bound cleans up entryIds correctly', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  const id1 = tree.put(1, 'v1');
  const id2 = tree.put(2, 'v2');
  const id3 = tree.put(3, 'v3');
  const id4 = tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { upperBound: 'exclusive' }), 3);
  // id4 should survive (exclusive upper bound)
  assert.deepEqual(tree.peekById(id4), { entryId: id4, key: 4, value: 'v4' });
  // id1, id2, id3 should be removed from lookup map
  assert.equal(tree.peekById(id1), null);
  assert.equal(tree.peekById(id2), null);
  assert.equal(tree.peekById(id3), null);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('deleteRange() with both bounds exclusive cleans up entryIds correctly', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  const id1 = tree.put(1, 'v1');
  const id2 = tree.put(2, 'v2');
  const id3 = tree.put(3, 'v3');
  const id4 = tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 2);
  // id1 and id4 should survive
  assert.deepEqual(tree.peekById(id1), { entryId: id1, key: 1, value: 'v1' });
  assert.deepEqual(tree.peekById(id4), { entryId: id4, key: 4, value: 'v4' });
  // id2 and id3 should be removed
  assert.equal(tree.peekById(id2), null);
  assert.equal(tree.peekById(id3), null);
  assert.equal(tree.size(), 2);
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - after putMany (bulk-loaded tree)
// ===========================================================================

void test('deleteRange() on bulk-loaded tree matches count()', (): void => {
  const tree = numTree();
  const entries = Array.from({ length: 30 }, (_, i) => ({
    key: (i + 1) * 10,
    value: `v${(i + 1) * 10}`,
  }));
  tree.putMany(entries);
  tree.assertInvariants();

  const expectedCount = tree.count(50, 200);
  const rangeLen = tree.range(50, 200).length;
  assert.equal(expectedCount, rangeLen, 'count and range should agree before delete');
  const sizeBefore = tree.size();

  const deleted = tree.deleteRange(50, 200);
  assert.equal(deleted, expectedCount, `deleteRange deleted ${deleted} but count was ${expectedCount}`);
  assert.equal(tree.size(), sizeBefore - expectedCount);
  assert.equal(tree.get(40), 'v40');
  assert.equal(tree.get(50), null);
  assert.equal(tree.get(200), null);
  assert.equal(tree.get(210), 'v210');
  tree.assertInvariants();
});

void test('deleteRange() empties a bulk-loaded tree completely', (): void => {
  const tree = numTree();
  const entries = Array.from({ length: 20 }, (_, i) => ({
    key: i + 1,
    value: `v${i + 1}`,
  }));
  tree.putMany(entries);

  assert.equal(tree.deleteRange(1, 20), 20);
  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();

  // Tree is usable after clearing via deleteRange
  tree.put(99, 'ok');
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - clone and serialization after deletion
// ===========================================================================

void test('clone() produces correct copy after deleteRange()', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 30; i += 1) {
    tree.put(i, `v${i}`);
  }

  tree.deleteRange(10, 20);
  tree.assertInvariants();

  const cloned = tree.clone();
  assert.equal(cloned.size(), tree.size());
  assert.deepEqual(cloned.snapshot().map((e) => e.key), tree.snapshot().map((e) => e.key));
  cloned.assertInvariants();

  // Structural independence: mutating clone does not affect original
  cloned.put(15, 'new');
  assert.equal(tree.get(15), null);
  assert.equal(cloned.get(15), 'new');
});

void test('toJSON/fromJSON round-trip after deleteRange()', (): void => {
  const cmp = (a: number, b: number): number => a - b;
  const tree = new InMemoryBTree<number, string>({
    compareKeys: cmp,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });
  for (let i = 1; i <= 30; i += 1) {
    tree.put(i, `v${i}`);
  }

  tree.deleteRange(5, 25);
  tree.assertInvariants();

  const json = tree.toJSON();
  const restored = InMemoryBTree.fromJSON<number, string>(json, cmp);
  assert.equal(restored.size(), tree.size());
  assert.deepEqual(
    restored.snapshot().map((e) => ({ key: e.key, value: e.value })),
    tree.snapshot().map((e) => ({ key: e.key, value: e.value })),
  );
  restored.assertInvariants();
});

// ===========================================================================
// deleteRange() - string keys
// ===========================================================================

// deleteRange() - leaf-to-leaf walk without rebalance

void test('deleteRange() walks across leaves without triggering rebalance', (): void => {
  // Use maxLeafEntries=4 so minLeafEntries=2.
  // Insert keys 1..12 → leaves: [1,2,3,4], [5,6,7,8], [9,10,11,12].
  // deleteRange(3, 10) should:
  //   Leaf [1,2,3,4]: delete 3,4 (idx=2..4), leaving [1,2] (>=min). No rebalance.
  //     → lines 161-163: leaf.next !== null, advance to next leaf.
  //   Leaf [5,6,7,8]: delete all, advance.
  //   Leaf [9,10,11,12]: delete 9,10.
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });
  for (let i = 1; i <= 12; i += 1) {
    tree.put(i, `v${i}`);
  }
  tree.assertInvariants();

  const deleted = tree.deleteRange(3, 10);
  assert.equal(deleted, 8);
  assert.equal(tree.size(), 4);

  // Boundary entries should survive
  assert.equal(tree.get(1), 'v1');
  assert.equal(tree.get(2), 'v2');
  assert.equal(tree.get(11), 'v11');
  assert.equal(tree.get(12), 'v12');

  // Deleted entries should be gone
  for (let i = 3; i <= 10; i += 1) {
    assert.equal(tree.get(i), null);
  }

  tree.assertInvariants();
});

void test('deleteRange() works with string keys (lexicographic comparison)', (): void => {
  const tree = new InMemoryBTree<string, number>({
    compareKeys: (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape'];
  for (const w of words) {
    tree.put(w, w.length);
  }
  tree.assertInvariants();

  assert.equal(tree.deleteRange('cherry', 'fig'), 4);
  assert.equal(tree.size(), 3);
  assert.equal(tree.get('banana'), 6);
  assert.equal(tree.get('cherry'), null);
  assert.equal(tree.get('fig'), null);
  assert.equal(tree.get('grape'), 5);
  tree.assertInvariants();
});
