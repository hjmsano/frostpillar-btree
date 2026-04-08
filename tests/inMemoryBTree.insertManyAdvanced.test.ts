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
// putMany — autoScale
// ---------------------------------------------------------------------------

void test('putMany with autoScale builds correct tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  const entries = Array.from({ length: 500 }, (_, i) => ({
    key: i,
    value: `v${String(i)}`,
  }));

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 500);
  assert.equal(tree.size(), 500);
  assert.equal(tree.get(0), 'v0');
  assert.equal(tree.get(499), 'v499');
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — large scale correctness
// ---------------------------------------------------------------------------

void test('putMany on empty tree with 1000 entries passes invariants', (): void => {
  const tree = numTree({ maxLeafEntries: 16, maxBranchChildren: 8 });
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    key: i,
    value: `v${String(i)}`,
  }));

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 1000);
  assert.equal(tree.size(), 1000);
  assert.equal(tree.peekFirst()?.key, 0);
  assert.equal(tree.peekLast()?.key, 999);
  tree.assertInvariants();
});

void test('putMany bulk load produces same logical result as sequential insert', (): void => {
  const entries = Array.from({ length: 50 }, (_, i) => ({
    key: i * 2,
    value: `v${String(i)}`,
  }));
  const treeBulk = numTree();
  treeBulk.putMany(entries);
  const treeSeq = numTree();
  for (const e of entries) treeSeq.put(e.key, e.value);
  const snapBulk = treeBulk.snapshot();
  const snapSeq = treeSeq.snapshot();
  assert.equal(snapBulk.length, snapSeq.length);
  for (let i = 0; i < snapBulk.length; i += 1) {
    assert.equal(snapBulk[i].key, snapSeq[i].key);
    assert.equal(snapBulk[i].value, snapSeq[i].value);
  }
  treeBulk.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — operations work after bulk load
// ---------------------------------------------------------------------------

void test('tree operations work after putMany bulk load', (): void => {
  const tree = numTree();
  tree.putMany([
    { key: 10, value: 'a' },
    { key: 20, value: 'b' },
    { key: 30, value: 'c' },
    { key: 40, value: 'd' },
    { key: 50, value: 'e' },
  ]);

  tree.put(25, 'x');
  assert.equal(tree.get(25), 'x');

  tree.remove(30);
  assert.equal(tree.get(30), null);

  const r = tree.range(10, 40);
  assert.equal(r.length, 4);

  const first = tree.popFirst();
  assert.equal(first?.key, 10);
  const last = tree.popLast();
  assert.equal(last?.key, 50);

  assert.equal(tree.size(), 3);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — clear then putMany
// ---------------------------------------------------------------------------

void test('putMany works after clear', (): void => {
  const tree = numTree();
  tree.put(1, 'x');
  tree.put(2, 'y');
  tree.clear();

  const ids = tree.putMany([
    { key: 10, value: 'a' },
    { key: 20, value: 'b' },
  ]);

  assert.equal(ids.length, 2);
  assert.equal(tree.size(), 2);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — non-empty tree with replace overlap
// ---------------------------------------------------------------------------

void test('putMany into non-empty tree with replace policy replaces overlapping keys', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });
  tree.put(10, 'old10');
  tree.put(20, 'old20');
  tree.put(30, 'old30');

  tree.putMany([
    { key: 15, value: 'new15' },
    { key: 20, value: 'new20' },
    { key: 25, value: 'new25' },
  ]);

  assert.equal(tree.size(), 5);
  assert.equal(tree.get(10), 'old10');
  assert.equal(tree.get(15), 'new15');
  assert.equal(tree.get(20), 'new20');
  assert.equal(tree.get(25), 'new25');
  assert.equal(tree.get(30), 'old30');
  tree.assertInvariants();
});

void test('putMany into non-empty tree with reject policy throws on duplicate', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  tree.put(10, 'a');
  tree.put(30, 'c');

  assert.throws(
    () =>
      tree.putMany([
        { key: 20, value: 'b' },
        { key: 30, value: 'dup' },
      ]),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
});
