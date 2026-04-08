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

// --- only lowerBound set, upperBound defaults to inclusive ---

void test('range with only lowerBound exclusive, upperBound defaults to inclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  const id3 = tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { lowerBound: 'exclusive' }), [
    { entryId: id2, key: 2, value: 'b' },
    { entryId: id3, key: 3, value: 'c' },
  ]);
});

// --- only upperBound set, lowerBound defaults to inclusive ---

void test('range with only upperBound exclusive, lowerBound defaults to inclusive', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { upperBound: 'exclusive' }), [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
  ]);
});

// --- invalid/unrecognized RangeBounds values default to inclusive ---

void test('range treats unrecognized lowerBound value as inclusive', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  const id3 = tree.put(3, 'c');

  // Unknown string is treated as inclusive (not exclusive)
  const result = tree.range(1, 3, { lowerBound: 'invalid' as 'inclusive' });
  assert.deepEqual(result, [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
    { entryId: id3, key: 3, value: 'c' },
  ]);
});

void test('count treats unrecognized upperBound value as inclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  const count = tree.count(1, 3, { upperBound: 'bogus' as 'inclusive' });
  assert.equal(count, 3, 'unrecognized value should act as inclusive');
});

void test('deleteRange treats unrecognized bounds as inclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  const deleted = tree.deleteRange(1, 3, {
    lowerBound: 'nope' as 'inclusive',
    upperBound: 'nah' as 'inclusive',
  });
  assert.equal(deleted, 3, 'unrecognized bounds should act as inclusive');
  assert.equal(tree.size(), 0);
});

void test('range with undefined options is equivalent to inclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3), tree.range(1, 3, undefined));
  assert.deepEqual(tree.range(1, 3), tree.range(1, 3, {}));
});
