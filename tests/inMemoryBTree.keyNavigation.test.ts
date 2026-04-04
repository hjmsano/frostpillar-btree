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
// nextHigherKey – empty tree
// ===========================================================================

void test('nextHigherKey() returns null for empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.nextHigherKey(5), null);
});

// ===========================================================================
// nextHigherKey – basic cases
// ===========================================================================

void test('nextHigherKey() returns next key when it exists', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextHigherKey(10), 20);
  assert.equal(tree.nextHigherKey(20), 30);
});

void test('nextHigherKey() returns null when key is the largest', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextHigherKey(30), null);
});

void test('nextHigherKey() returns first key when query is smaller than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.nextHigherKey(5), 10);
});

void test('nextHigherKey() returns next key when query is not in tree (gap)', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextHigherKey(15), 20);
  assert.equal(tree.nextHigherKey(25), 30);
});

void test('nextHigherKey() returns null when query is larger than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.nextHigherKey(100), null);
});

// ===========================================================================
// nextHigherKey – duplicate keys
// ===========================================================================

void test('nextHigherKey() skips all entries with equal key (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'a');
  tree.put(10, 'b');
  tree.put(10, 'c');
  tree.put(20, 'd');

  assert.equal(tree.nextHigherKey(10), 20);
});

void test('nextHigherKey() returns null when all entries have equal key (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'a');
  tree.put(10, 'b');

  assert.equal(tree.nextHigherKey(10), null);
});

// ===========================================================================
// nextHigherKey – multi-leaf tree
// ===========================================================================

void test('nextHigherKey() works across leaf boundaries', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i * 10, `v${i * 10}`);
  }
  tree.assertInvariants();

  assert.equal(tree.nextHigherKey(30), 40);
  assert.equal(tree.nextHigherKey(100), 110);
  assert.equal(tree.nextHigherKey(200), null);
  assert.equal(tree.nextHigherKey(0), 10);
});

// ===========================================================================
// nextLowerKey – empty tree
// ===========================================================================

void test('nextLowerKey() returns null for empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.nextLowerKey(5), null);
});

// ===========================================================================
// nextLowerKey – basic cases
// ===========================================================================

void test('nextLowerKey() returns previous key when it exists', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextLowerKey(20), 10);
  assert.equal(tree.nextLowerKey(30), 20);
});

void test('nextLowerKey() returns null when key is the smallest', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextLowerKey(10), null);
});

void test('nextLowerKey() returns largest key when query is larger than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.nextLowerKey(100), 20);
});

void test('nextLowerKey() returns previous key when query is not in tree (gap)', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.equal(tree.nextLowerKey(15), 10);
  assert.equal(tree.nextLowerKey(25), 20);
});

void test('nextLowerKey() returns null when query is smaller than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.nextLowerKey(1), null);
});

// ===========================================================================
// nextLowerKey – duplicate keys
// ===========================================================================

void test('nextLowerKey() skips all entries with equal key (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'a');
  tree.put(20, 'b');
  tree.put(20, 'c');
  tree.put(20, 'd');

  assert.equal(tree.nextLowerKey(20), 10);
});

void test('nextLowerKey() returns null when all entries have equal key (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'a');
  tree.put(10, 'b');

  assert.equal(tree.nextLowerKey(10), null);
});

// ===========================================================================
// nextLowerKey – multi-leaf tree
// ===========================================================================

void test('nextLowerKey() works across leaf boundaries', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i * 10, `v${i * 10}`);
  }
  tree.assertInvariants();

  assert.equal(tree.nextLowerKey(40), 30);
  assert.equal(tree.nextLowerKey(110), 100);
  assert.equal(tree.nextLowerKey(10), null);
  assert.equal(tree.nextLowerKey(250), 200);
});

// ===========================================================================
// getPairOrNextLower – empty tree
// ===========================================================================

void test('getPairOrNextLower() returns null for empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.getPairOrNextLower(5), null);
});

// ===========================================================================
// getPairOrNextLower – exact match
// ===========================================================================

void test('getPairOrNextLower() returns exact match when key exists', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  const result = tree.getPairOrNextLower(20);
  assert.notEqual(result, null);
  assert.equal(result!.key, 20);
  assert.equal(result!.value, 'v20');
});

// ===========================================================================
// getPairOrNextLower – no exact match, falls back to lower
// ===========================================================================

void test('getPairOrNextLower() returns next lower entry when no exact match', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  const result = tree.getPairOrNextLower(25);
  assert.notEqual(result, null);
  assert.equal(result!.key, 20);
  assert.equal(result!.value, 'v20');
});

void test('getPairOrNextLower() returns null when query is smaller than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.getPairOrNextLower(5), null);
});

void test('getPairOrNextLower() returns largest entry when query is larger than all keys', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  const result = tree.getPairOrNextLower(100);
  assert.notEqual(result, null);
  assert.equal(result!.key, 20);
  assert.equal(result!.value, 'v20');
});

// ===========================================================================
// getPairOrNextLower – duplicate keys
// ===========================================================================

void test('getPairOrNextLower() returns first entry on exact match (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'first');
  tree.put(10, 'second');
  tree.put(10, 'third');

  const result = tree.getPairOrNextLower(10);
  assert.notEqual(result, null);
  assert.equal(result!.key, 10);
  assert.equal(result!.value, 'first');
});

void test('getPairOrNextLower() falls back to lower when key not present (duplicateKeys: allow)', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(10, 'a');
  tree.put(10, 'b');
  tree.put(20, 'c');

  const result = tree.getPairOrNextLower(15);
  assert.notEqual(result, null);
  assert.equal(result!.key, 10);
});

// ===========================================================================
// getPairOrNextLower – multi-leaf tree
// ===========================================================================

void test('getPairOrNextLower() works across leaf boundaries', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i * 10, `v${i * 10}`);
  }
  tree.assertInvariants();

  const exact = tree.getPairOrNextLower(100);
  assert.notEqual(exact, null);
  assert.equal(exact!.key, 100);

  const lower = tree.getPairOrNextLower(105);
  assert.notEqual(lower, null);
  assert.equal(lower!.key, 100);

  assert.equal(tree.getPairOrNextLower(5), null);

  const largest = tree.getPairOrNextLower(999);
  assert.notEqual(largest, null);
  assert.equal(largest!.key, 200);
});

void test('getPairOrNextLower() falls back to prev leaf when query lands at leaf start', (): void => {
  // With maxLeafEntries=3, keys [10,20,30,40,50,60] span multiple leaves.
  // Query a gap value just above a leaf boundary so lowerBound lands at idx=0.
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');
  tree.put(40, 'v40');
  tree.put(50, 'v50');
  tree.put(60, 'v60');
  tree.assertInvariants();

  // For each leaf boundary, try a key that's just below the first key in the next leaf
  // to exercise the leaf.prev fallback in navigation.ts findPairOrNextLower.
  const snap = tree.snapshot();
  for (let i = 1; i < snap.length; i += 1) {
    const gapKey = snap[i].key - 1;
    if (gapKey === snap[i - 1].key) continue; // skip if keys are adjacent
    const result = tree.getPairOrNextLower(gapKey);
    assert.notEqual(result, null, `expected result for gapKey=${gapKey}`);
    assert.ok(result!.key < snap[i].key);
    assert.ok(result!.key <= gapKey);
  }
});

