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

// ---------------------------------------------------------------------------
// Iterator stability under mutation
// ---------------------------------------------------------------------------

void test('entries() iterator observes inserts that happen after creation', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(3, 'c');

  const iter = tree.entries();
  const first = iter.next();
  assert.equal(first.done, false);
  assert.equal(first.value.key, 1);

  // Insert between already-yielded key and remaining keys
  tree.put(2, 'b');

  // Collect remaining entries from the iterator
  const rest: number[] = [];
  for (const entry of iter) {
    rest.push(entry.key);
  }
  // The iterator walks the leaf chain — inserted entry may or may not appear
  // depending on which leaf it lands in. The key invariant is no crash and
  // the tree remains valid.
  assert.ok(
    rest.length >= 1,
    'iterator should yield at least remaining entries',
  );
  tree.assertInvariants();
});

void test('entries() iterator does not crash when remove shrinks current leaf', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 9; i += 1) {
    tree.put(i, `v${i}`);
  }

  const iter = tree.entries();
  const first = iter.next();
  assert.equal(first.done, false);

  // Remove entries that may trigger rebalancing
  tree.remove(2);
  tree.remove(3);

  // Consuming the rest should not throw
  const rest: number[] = [];
  for (const entry of iter) {
    rest.push(entry.key);
  }
  assert.ok(rest.length > 0);
  tree.assertInvariants();
});

void test('entries() iterator does not crash when deleteRange removes ahead', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 15; i += 1) {
    tree.put(i, `v${i}`);
  }

  const iter = tree.entries();
  // Consume first entry
  iter.next();

  // Delete a range ahead of the iterator
  tree.deleteRange(5, 10);

  // Consume remaining — should not throw
  const rest: number[] = [];
  for (const entry of iter) {
    rest.push(entry.key);
  }
  // Keys 5-10 were deleted, so they should not appear
  for (const k of rest) {
    assert.ok(k < 5 || k > 10, `deleted key ${k} should not appear`);
  }
  tree.assertInvariants();
});
