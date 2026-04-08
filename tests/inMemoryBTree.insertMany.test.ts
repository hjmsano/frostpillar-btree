import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
  autoScale?: boolean;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ---------------------------------------------------------------------------
// putMany — empty input
// ---------------------------------------------------------------------------

void test('putMany with empty array is a no-op', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  assert.deepEqual(tree.putMany([]), []);
  assert.equal(tree.size(), 1);
  const empty = numTree();
  assert.deepEqual(empty.putMany([]), []);
  assert.equal(empty.size(), 0);
});

// ---------------------------------------------------------------------------
// putMany — basic sorted insert on empty tree
// ---------------------------------------------------------------------------

void test('putMany on empty tree builds correct sorted structure', (): void => {
  const tree = numTree();
  const entries = [
    { key: 1, value: 'a' },
    { key: 2, value: 'b' },
    { key: 3, value: 'c' },
    { key: 4, value: 'd' },
    { key: 5, value: 'e' },
  ];

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 5);
  assert.equal(tree.size(), 5);
  const snap = tree.snapshot();
  assert.equal(snap.length, 5);
  assert.equal(snap[0].key, 1);
  assert.equal(snap[0].value, 'a');
  assert.equal(snap[4].key, 5);
  assert.equal(snap[4].value, 'e');
  tree.assertInvariants();
});

void test('putMany on empty tree with single entry', (): void => {
  const tree = numTree();

  const ids = tree.putMany([{ key: 42, value: 'x' }]);

  assert.equal(ids.length, 1);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(42), 'x');
  tree.assertInvariants();
});

void test('putMany on empty tree with many entries triggers splits', (): void => {
  const tree = numTree();
  const entries = Array.from({ length: 30 }, (_, i) => ({
    key: i * 10,
    value: `v${String(i)}`,
  }));

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 30);
  assert.equal(tree.size(), 30);
  for (let i = 0; i < 30; i += 1) {
    assert.equal(tree.get(i * 10), `v${String(i)}`);
  }
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — non-empty tree
// ---------------------------------------------------------------------------

void test('putMany on non-empty tree inserts sequentially', (): void => {
  const tree = numTree();
  tree.put(1, 'existing1');
  tree.put(5, 'existing5');

  const ids = tree.putMany([
    { key: 2, value: 'a' },
    { key: 3, value: 'b' },
    { key: 4, value: 'c' },
  ]);

  assert.equal(ids.length, 3);
  assert.equal(tree.size(), 5);
  assert.equal(tree.get(2), 'a');
  assert.equal(tree.get(3), 'b');
  assert.equal(tree.get(4), 'c');
  tree.assertInvariants();
});

void test('putMany on non-empty tree with many entries', (): void => {
  const tree = numTree();
  for (let i = 0; i < 10; i += 1) {
    tree.put(i * 100, `old${String(i)}`);
  }

  const newEntries = Array.from({ length: 20 }, (_, i) => ({
    key: i * 5 + 1,
    value: `new${String(i)}`,
  }));

  const ids = tree.putMany(newEntries);

  assert.equal(ids.length, 20);
  assert.equal(tree.size(), 30);
  tree.assertInvariants();
});
