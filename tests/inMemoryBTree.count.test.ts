import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ===========================================================================
// count() – empty tree
// ===========================================================================

void test('count() returns 0 for empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.count(1, 10), 0);
});

void test('count() returns 0 for empty tree with all bound combinations', (): void => {
  const tree = numTree();
  assert.equal(tree.count(1, 10, { lowerBound: 'exclusive' }), 0);
  assert.equal(tree.count(1, 10, { upperBound: 'exclusive' }), 0);
  assert.equal(tree.count(1, 10, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 0);
  assert.equal(tree.count(1, 10, { lowerBound: 'inclusive', upperBound: 'inclusive' }), 0);
  assert.equal(tree.count(5, 5, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 0);
});

// ===========================================================================
// count() – basic cases
// ===========================================================================

void test('count() returns correct count for single-key range', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  tree.put(10, 'v10');
  tree.put(15, 'v15');

  assert.equal(tree.count(10, 10), 1);
  tree.assertInvariants();
});

void test('count() returns correct count for multi-key range', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.count(3, 7), 5);
  tree.assertInvariants();
});

void test('count() returns 0 when start > end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  tree.put(10, 'v10');

  assert.equal(tree.count(10, 5), 0);
});

void test('count() returns total count for full range', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.count(1, 20), 20);
  tree.assertInvariants();
});

void test('count() returns 0 when range misses all keys', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(10, 'v10');

  assert.equal(tree.count(3, 7), 0);
});

// ===========================================================================
// count() – duplicate keys
// ===========================================================================

void test('count() counts all duplicate-key entries in range', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');
  tree.put(10, 'd');

  assert.equal(tree.count(5, 5), 3);
  assert.equal(tree.count(5, 10), 4);
  tree.assertInvariants();
});

// ===========================================================================
// count() – bound options (RangeBounds)
// ===========================================================================

void test('count() with exclusive lower bound', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.count(1, 4, { lowerBound: 'exclusive' }), 3);
});

void test('count() with exclusive upper bound', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.count(1, 4, { upperBound: 'exclusive' }), 3);
});

void test('count() with both bounds exclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');

  assert.equal(tree.count(1, 4, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 2);
});

void test('count() returns 0 when both bounds exclusive and start === end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  assert.equal(tree.count(5, 5, { lowerBound: 'exclusive', upperBound: 'exclusive' }), 0);
});

void test('count() with exclusive bounds and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');
  tree.put(10, 'd');
  tree.put(10, 'e');

  // exclusive lower on 5 → excludes all 5s
  assert.equal(tree.count(5, 10, { lowerBound: 'exclusive' }), 2);
  // exclusive upper on 10 → excludes all 10s
  assert.equal(tree.count(5, 10, { upperBound: 'exclusive' }), 3);
  tree.assertInvariants();
});

// ===========================================================================
// count() – large window (spanning multiple leaves)
// ===========================================================================

void test('count() works across multiple leaf nodes', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 100; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.count(10, 90), 81);
  assert.equal(tree.count(1, 100), 100);
  assert.equal(tree.count(50, 50), 1);
  tree.assertInvariants();
});

// ===========================================================================
// count() – consistency with range()
// ===========================================================================

void test('count() result matches range().length', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  assert.equal(tree.count(5, 45), tree.range(5, 45).length);
  assert.equal(
    tree.count(5, 45, { lowerBound: 'exclusive' }),
    tree.range(5, 45, { lowerBound: 'exclusive' }).length,
  );
  assert.equal(
    tree.count(5, 45, { upperBound: 'exclusive' }),
    tree.range(5, 45, { upperBound: 'exclusive' }).length,
  );
  assert.equal(
    tree.count(5, 45, { lowerBound: 'exclusive', upperBound: 'exclusive' }),
    tree.range(5, 45, { lowerBound: 'exclusive', upperBound: 'exclusive' }).length,
  );
  tree.assertInvariants();
});
