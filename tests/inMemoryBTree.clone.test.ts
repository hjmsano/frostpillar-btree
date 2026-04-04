import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryBTree,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const compareNumbers = (left: number, right: number): number => left - right;

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
  autoScale?: boolean;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: compareNumbers,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ===========================================================================
// clone()
// ===========================================================================

void test('clone() on empty tree returns empty tree', (): void => {
  const tree = numTree();
  const cloned = tree.clone();
  assert.equal(cloned.size(), 0);
  assert.deepEqual(cloned.snapshot(), []);
  cloned.assertInvariants();
});

void test('clone() produces a tree with the same entries in the same order', (): void => {
  const tree = numTree();
  tree.put(10, 'a');
  tree.put(20, 'b');
  tree.put(5, 'c');

  const cloned = tree.clone();
  assert.equal(cloned.size(), tree.size());

  const origSnap = tree.snapshot();
  const cloneSnap = cloned.snapshot();
  for (let i = 0; i < origSnap.length; i++) {
    assert.equal(cloneSnap[i].key, origSnap[i].key);
    assert.equal(cloneSnap[i].value, origSnap[i].value);
  }
  cloned.assertInvariants();
});

void test('clone() produces structurally independent tree', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  const cloned = tree.clone();

  tree.put(4, 'd');
  tree.remove(1);
  assert.equal(cloned.size(), 3);
  assert.equal(cloned.get(1), 'a');
  assert.equal(cloned.get(4), null);

  cloned.put(100, 'z');
  assert.equal(tree.get(100), null);
  tree.assertInvariants();
  cloned.assertInvariants();
});

void test('clone() preserves duplicateKeys allow policy and insertion order', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'first');
  tree.put(5, 'second');
  tree.put(5, 'third');
  tree.put(3, 'lo');
  tree.put(7, 'hi');

  const snap = tree.clone().snapshot();
  assert.equal(snap.length, 5);
  assert.equal(snap[0].key, 3);
  assert.equal(snap[1].value, 'first');
  assert.equal(snap[2].value, 'second');
  assert.equal(snap[3].value, 'third');
  assert.equal(snap[4].key, 7);
});

void test('clone() preserves duplicateKeys reject policy', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  tree.put(1, 'a');

  const cloned = tree.clone();
  assert.throws(
    () => cloned.put(1, 'dup'),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
});

void test('clone() preserves duplicateKeys replace policy', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });
  tree.put(1, 'a');
  tree.put(1, 'replaced');

  const cloned = tree.clone();
  assert.equal(cloned.get(1), 'replaced');
  assert.equal(cloned.size(), 1);
});

void test('clone() preserves enableEntryIdLookup setting', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  tree.put(1, 'a');

  const cloned = tree.clone();
  const found = cloned.peekById(cloned.snapshot()[0].entryId);
  assert.notEqual(found, null);
  assert.equal(found!.key, 1);
});

void test('clone() without enableEntryIdLookup throws on peekById', (): void => {
  const tree = numTree({ enableEntryIdLookup: false });
  tree.put(1, 'a');

  assert.throws(
    () => tree.clone().peekById(0 as never),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
});

void test('clone() with many entries maintains invariants', (): void => {
  const tree = numTree();
  for (let i = 0; i < 50; i++) tree.put(i, `v${i}`);

  const cloned = tree.clone();
  assert.equal(cloned.size(), 50);
  for (let i = 0; i < 50; i++) assert.equal(cloned.get(i), `v${i}`);
  cloned.assertInvariants();
});

void test('clone() preserves autoScale setting', (): void => {
  const tree = new InMemoryBTree<number, string>({ compareKeys: compareNumbers, autoScale: true });
  for (let i = 0; i < 20; i++) tree.put(i, `v${i}`);

  const cloned = tree.clone();
  assert.equal(cloned.size(), 20);
  cloned.assertInvariants();
});

void test('clone() preserves current autoScale capacities after high-water growth', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: compareNumbers,
    autoScale: true,
  });

  for (let i = 0; i < 120_000; i += 1) {
    tree.put(i, `v${i}`);
  }
  for (let i = 0; i < 119_900; i += 1) {
    tree.popFirst();
  }

  const beforeConfig = tree.toJSON().config;
  const cloned = tree.clone();
  const afterConfig = cloned.toJSON().config;

  assert.equal(beforeConfig.maxLeafEntries, 256);
  assert.equal(beforeConfig.maxBranchChildren, 128);
  assert.equal(afterConfig.maxLeafEntries, beforeConfig.maxLeafEntries);
  assert.equal(afterConfig.maxBranchChildren, beforeConfig.maxBranchChildren);
  assert.equal(cloned.size(), tree.size());
  cloned.assertInvariants();
});

void test('clone() deep aliasing: heavy mutations on both sides do not corrupt either tree', (): void => {
  const tree = numTree();
  for (let i = 0; i < 50; i += 1) tree.put(i, `v${i}`);

  const cloned = tree.clone();

  // Heavily mutate original: remove half, insert new keys
  for (let i = 0; i < 25; i += 1) tree.remove(i);
  for (let i = 100; i < 130; i += 1) tree.put(i, `new-${i}`);

  // Heavily mutate clone: different removals and inserts
  for (let i = 25; i < 50; i += 1) cloned.remove(i);
  for (let i = 200; i < 230; i += 1) cloned.put(i, `clone-${i}`);

  // Both must be independently valid
  tree.assertInvariants();
  cloned.assertInvariants();

  // Verify no cross-contamination
  assert.equal(tree.get(200), null, 'original should not have cloned inserts');
  assert.equal(cloned.get(100), null, 'clone should not have original inserts');
  assert.equal(tree.size(), 55); // 50 - 25 + 30
  assert.equal(cloned.size(), 55); // 50 - 25 + 30

  // Verify forward/reverse consistency on both
  const origForward = [...tree.keys()];
  const origReverse = [...tree.entriesReversed()].map((e) => e.key);
  assert.deepEqual(origForward, origReverse.reverse());

  const cloneForward = [...cloned.keys()];
  const cloneReverse = [...cloned.entriesReversed()].map((e) => e.key);
  assert.deepEqual(cloneForward, cloneReverse.reverse());
});

void test('clone preserves auto-scaled capacity', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: compareNumbers,
    autoScale: true,
  });
  for (let i = 0; i < 1100; i += 1) tree.put(i, i);
  const originalJSON = tree.toJSON();

  const cloned = tree.clone();
  cloned.assertInvariants();
  assert.equal(cloned.size(), 1100);

  const clonedJSON = cloned.toJSON();
  assert.equal(clonedJSON.config.autoScale, true);
  assert.equal(clonedJSON.config.maxLeafEntries, originalJSON.config.maxLeafEntries);
  assert.equal(clonedJSON.config.maxBranchChildren, originalJSON.config.maxBranchChildren);
});

void test('clone of cloned tree produces independent third copy', (): void => {
  const original = numTree();
  original.put(1, 'a');
  original.put(2, 'b');

  const clone1 = original.clone();
  const clone2 = clone1.clone();

  // Mutate each independently
  original.put(100, 'orig');
  clone1.put(200, 'c1');
  clone2.put(300, 'c2');

  assert.equal(original.get(200), null);
  assert.equal(original.get(300), null);
  assert.equal(clone1.get(100), null);
  assert.equal(clone1.get(300), null);
  assert.equal(clone2.get(100), null);
  assert.equal(clone2.get(200), null);

  original.assertInvariants();
  clone1.assertInvariants();
  clone2.assertInvariants();
});
