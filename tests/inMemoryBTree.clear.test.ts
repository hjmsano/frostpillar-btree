import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, type EntryId } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
  autoScale?: boolean;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ---------------------------------------------------------------------------
// clear() — basic behavior
// ---------------------------------------------------------------------------

void test('clear() resets a non-empty tree to empty state', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  tree.clear();

  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  assert.equal(tree.peekFirst(), null);
  assert.equal(tree.peekLast(), null);
  assert.equal(tree.popFirst(), null);
  assert.equal(tree.popLast(), null);
  assert.deepEqual(tree.range(1, 100), []);
  tree.assertInvariants();
});

void test('clear() on empty tree is a no-op', (): void => {
  const tree = numTree();

  tree.clear();

  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  assert.equal(tree.peekFirst(), null);
  assert.equal(tree.peekLast(), null);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// clear() — re-insert after clear
// ---------------------------------------------------------------------------

void test('tree functions normally after clear and re-insert', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  tree.clear();

  const newId = tree.put(5, 'v5');
  assert.equal(newId, 2 as EntryId);
  assert.equal(tree.size(), 1);
  assert.deepEqual(tree.snapshot(), [{ entryId: newId, key: 5, value: 'v5' }]);
  tree.assertInvariants();
});

void test('clear followed by many inserts maintains invariants', (): void => {
  const tree = numTree();
  for (let i = 0; i < 30; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  tree.clear();

  for (let i = 0; i < 30; i += 1) {
    tree.put(i * 2, `w${String(i)}`);
  }

  assert.equal(tree.size(), 30);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// clear() — entryKeys / enableEntryIdLookup
// ---------------------------------------------------------------------------

void test('clear() removes all entry-ID lookup state', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  const id1 = tree.put(10, 'v10');
  const id2 = tree.put(20, 'v20');

  tree.clear();

  assert.equal(tree.peekById(id1), null);
  assert.equal(tree.peekById(id2), null);
  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('clear() with enableEntryIdLookup allows new peekById after re-insert', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  tree.put(10, 'v10');

  tree.clear();

  const newId = tree.put(5, 'v5');
  assert.deepEqual(tree.peekById(newId), {
    entryId: newId,
    key: 5,
    value: 'v5',
  });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// clear() — duplicate keys
// ---------------------------------------------------------------------------

void test('clear() works with duplicateKeys allow mode', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');

  tree.clear();

  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// clear() — autoScale
// ---------------------------------------------------------------------------

void test('clear() with autoScale resets capacity to tier 0', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  // Insert enough entries to trigger scaling beyond tier 0
  for (let i = 0; i < 1500; i += 1) {
    tree.put(i, `v${String(i)}`);
  }
  assert.equal(tree.size(), 1500);

  tree.clear();

  assert.equal(tree.size(), 0);
  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();

  // Re-insert and verify invariants still hold
  for (let i = 0; i < 100; i += 1) {
    tree.put(i, `w${String(i)}`);
  }
  assert.equal(tree.size(), 100);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// clear() — iterators after clear
// ---------------------------------------------------------------------------

void test('iterators return empty results after clear', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  tree.clear();

  assert.deepEqual([...tree.entries()], []);
  assert.deepEqual([...tree.keys()], []);
  assert.deepEqual([...tree.values()], []);
  assert.deepEqual([...tree], []);

  let called = false;
  tree.forEach((): void => {
    called = true;
  });
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------
// clear() — multiple clear calls
// ---------------------------------------------------------------------------

void test('multiple consecutive clear calls are safe', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  tree.clear();
  tree.clear();
  tree.clear();

  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});
