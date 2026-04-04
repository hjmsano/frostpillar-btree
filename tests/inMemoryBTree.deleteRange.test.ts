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
// deleteRange() - empty tree
// ===========================================================================

void test('deleteRange() returns 0 for empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.deleteRange(1, 10), 0);
});

// ===========================================================================
// deleteRange() - basic cases
// ===========================================================================

void test('deleteRange() deletes a single entry', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  tree.put(10, 'v10');
  tree.put(15, 'v15');

  assert.equal(tree.deleteRange(10, 10), 1);
  assert.equal(tree.size(), 2);
  assert.equal(tree.get(10), null);
  assert.equal(tree.get(5), 'v5');
  assert.equal(tree.get(15), 'v15');
  tree.assertInvariants();
});

void test('deleteRange() deletes multiple entries in range', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(3, 7), 5);
  assert.equal(tree.size(), 5);
  for (let i = 3; i <= 7; i += 1) {
    assert.equal(tree.get(i), null);
  }
  assert.equal(tree.get(1), 'v1');
  assert.equal(tree.get(2), 'v2');
  assert.equal(tree.get(8), 'v8');
  tree.assertInvariants();
});

void test('deleteRange() returns 0 when start > end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  tree.put(10, 'v10');

  assert.equal(tree.deleteRange(10, 5), 0);
  assert.equal(tree.size(), 2);
});

void test('deleteRange() deletes all entries when range covers full tree', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(1, 10), 10);
  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();
});

void test('deleteRange() returns 0 when range misses all keys', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(10, 'v10');

  assert.equal(tree.deleteRange(3, 7), 0);
  assert.equal(tree.size(), 2);
});

// ===========================================================================
// deleteRange() - duplicate keys
// ===========================================================================

void test('deleteRange() deletes all duplicate-key entries in range', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');
  tree.put(10, 'd');

  assert.equal(tree.deleteRange(5, 5), 3);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(5), null);
  assert.equal(tree.get(10), 'd');
  tree.assertInvariants();
});

void test('deleteRange() deletes duplicate-key entries within a wider range', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(10, 'c');
  tree.put(10, 'd');
  tree.put(15, 'e');

  assert.equal(tree.deleteRange(5, 10), 4);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(15), 'e');
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - bound options (RangeBounds)
// ===========================================================================

void test('deleteRange() with exclusive lower bound', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { lowerBound: 'exclusive' }), 3);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(1), 'v1');
  tree.assertInvariants();
});

void test('deleteRange() with exclusive upper bound', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { upperBound: 'exclusive' }), 3);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(4), 'v4');
  tree.assertInvariants();
});

void test('deleteRange() with both bounds exclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.deleteRange(1, 4, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 2);
  assert.equal(tree.size(), 2);
  assert.equal(tree.get(1), 'v1');
  assert.equal(tree.get(4), 'v4');
  tree.assertInvariants();
});

void test('deleteRange() returns 0 when both bounds exclusive and start === end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  assert.equal(tree.deleteRange(5, 5, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 0);
  assert.equal(tree.size(), 1);
});

void test('deleteRange() with exclusive bounds and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');
  tree.put(10, 'd');
  tree.put(10, 'e');
  tree.put(15, 'f');

  // exclusive lower on 5: excludes all 5s, deletes 10s and nothing else (upper inclusive 10)
  assert.equal(tree.deleteRange(5, 10, { lowerBound: 'exclusive' }), 2);
  assert.equal(tree.size(), 4);
  tree.assertInvariants();
});

void test('deleteRange() with exclusive upper and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(10, 'c');
  tree.put(10, 'd');

  // exclusive upper on 10: excludes all 10s, deletes only 5s
  assert.equal(tree.deleteRange(5, 10, { upperBound: 'exclusive' }), 2);
  assert.equal(tree.size(), 2);
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - entryId lookup cleanup
// ===========================================================================

void test('deleteRange() removes entryIds from lookup map', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  const id5 = tree.put(5, 'v5');
  const id10 = tree.put(10, 'v10');
  tree.put(15, 'v15');

  tree.deleteRange(5, 10);

  assert.equal(tree.peekById(id5), null);
  assert.equal(tree.peekById(id10), null);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('deleteRange() removes entryIds from lookup map with duplicate keys', (): void => {
  const tree = numTree({ enableEntryIdLookup: true, duplicateKeys: 'allow' });
  const idA5 = tree.put(5, 'a');
  const idB5 = tree.put(5, 'b');
  const id10 = tree.put(10, 'c');
  tree.put(15, 'd');

  tree.deleteRange(5, 10);

  assert.equal(tree.peekById(idA5), null);
  assert.equal(tree.peekById(idB5), null);
  assert.equal(tree.peekById(id10), null);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(15), 'd');
  tree.assertInvariants();
});

// ===========================================================================
// deleteRange() - stress tests for rebalance and leaf-link consistency
// ===========================================================================

void test('deleteRange() maintains invariants after large range deletion', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 100; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(20, 80), 61);
  assert.equal(tree.size(), 39);
  tree.assertInvariants();

  // Verify boundary entries survived
  assert.equal(tree.get(19), 'v19');
  assert.equal(tree.get(20), null);
  assert.equal(tree.get(80), null);
  assert.equal(tree.get(81), 'v81');
});

void test('deleteRange() maintains invariants deleting from start', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(1, 25), 25);
  assert.equal(tree.size(), 25);
  assert.equal(tree.peekFirst()?.key, 26);
  tree.assertInvariants();
});

void test('deleteRange() maintains invariants deleting from end', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(26, 50), 25);
  assert.equal(tree.size(), 25);
  assert.equal(tree.peekLast()?.key, 25);
  tree.assertInvariants();
});

void test('deleteRange() handles repeated deletion correctly', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 30; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.deleteRange(1, 10), 10);
  assert.equal(tree.deleteRange(11, 20), 10);
  assert.equal(tree.deleteRange(21, 30), 10);
  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('deleteRange() stress with duplicate keys and rebalancing', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `a${i}`);
    tree.put(i, `b${i}`);
  }

  // Delete range [5, 15] should remove all entries for keys 5..15 (22 entries)
  assert.equal(tree.deleteRange(5, 15), 22);
  assert.equal(tree.size(), 18);
  tree.assertInvariants();

  // Verify boundary survived
  assert.equal(tree.get(4), 'a4');
  assert.equal(tree.get(5), null);
  assert.equal(tree.get(15), null);
  assert.equal(tree.get(16), 'a16');
});

// ===========================================================================
// deleteRange() - consistency with count()
// ===========================================================================

void test('deleteRange() result matches count() before deletion', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  const expectedCount = tree.count(10, 40);
  assert.equal(tree.deleteRange(10, 40), expectedCount);
  tree.assertInvariants();
});

void test('deleteRange() with bounds matches count() before deletion', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  const opts = { lowerBound: 'exclusive' as const, upperBound: 'exclusive' as const };

  // Build a separate tree with the same data to count first
  const tree2 = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree2.put(i, `v${i}`);
  }

  const expected = tree2.count(10, 40, opts);
  assert.equal(tree.deleteRange(10, 40, opts), expected);
  tree.assertInvariants();
});

