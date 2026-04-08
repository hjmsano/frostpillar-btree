import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, type BTreeEntry } from '../src/index.js';

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
// findFirst(key)
// ---------------------------------------------------------------------------

void test('findFirst returns null on empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.findFirst(42), null);
});

void test('findFirst returns the entry when key exists', (): void => {
  const tree = numTree();
  const id10 = tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.deepEqual(tree.findFirst(10), {
    entryId: id10,
    key: 10,
    value: 'v10',
  });
  tree.assertInvariants();
});

void test('findFirst returns null when key does not exist', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.findFirst(15), null);
  tree.assertInvariants();
});

void test('findFirst returns first duplicate when duplicateKeys is allow', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'other');
  const idFirst = tree.put(10, 'first');
  tree.put(10, 'second');
  tree.put(10, 'third');

  assert.deepEqual(tree.findFirst(10), {
    entryId: idFirst,
    key: 10,
    value: 'first',
  });
  tree.assertInvariants();
});

void test('findFirst works across leaf boundaries', (): void => {
  const tree = numTree();
  // Insert enough entries to force splits with maxLeafEntries: 3
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i * 10, `v${String(i * 10)}`);
  }

  const id70 = tree.findFirst(70);
  assert.notEqual(id70, null);
  assert.equal(id70!.key, 70);
  assert.equal(id70!.value, 'v70');

  assert.equal(tree.findFirst(75), null);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// findLast(key)
// ---------------------------------------------------------------------------

void test('findLast returns null on empty tree', (): void => {
  const tree = numTree();
  assert.equal(tree.findLast(42), null);
});

void test('findLast returns the entry when key exists (unique keys)', (): void => {
  const tree = numTree();
  const id10 = tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.deepEqual(tree.findLast(10), { entryId: id10, key: 10, value: 'v10' });
  tree.assertInvariants();
});

void test('findLast returns null when key does not exist', (): void => {
  const tree = numTree();
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.equal(tree.findLast(15), null);
  tree.assertInvariants();
});

void test('findLast returns last duplicate when duplicateKeys is allow', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'other');
  tree.put(10, 'first');
  tree.put(10, 'second');
  const idThird = tree.put(10, 'third');

  assert.deepEqual(tree.findLast(10), {
    entryId: idThird,
    key: 10,
    value: 'third',
  });
  tree.assertInvariants();
});

void test('findLast works across leaf boundaries', (): void => {
  const tree = numTree();
  // Insert enough entries to force splits with maxLeafEntries: 3
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i * 10, `v${String(i * 10)}`);
  }

  const id70 = tree.findLast(70);
  assert.notEqual(id70, null);
  assert.equal(id70!.key, 70);
  assert.equal(id70!.value, 'v70');

  assert.equal(tree.findLast(75), null);
  tree.assertInvariants();
});

void test('findFirst and findLast return same entry under reject policy', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');

  assert.deepEqual(tree.findFirst(20), tree.findLast(20));
  tree.assertInvariants();
});

void test('findFirst and findLast return same entry under replace policy', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(20, 'updated');

  assert.deepEqual(tree.findFirst(20), tree.findLast(20));
  assert.equal(tree.findLast(20)!.value, 'updated');
  tree.assertInvariants();
});

void test('findLast returns last of many duplicates spanning multiple leaves', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  // maxLeafEntries: 3, so inserting 6 entries with the same key will span multiple leaves
  tree.put(10, 'd1');
  tree.put(10, 'd2');
  tree.put(10, 'd3');
  tree.put(10, 'd4');
  tree.put(10, 'd5');
  const idLast = tree.put(10, 'd6');

  assert.deepEqual(tree.findLast(10), {
    entryId: idLast,
    key: 10,
    value: 'd6',
  });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

void test('getStats returns correct stats for empty tree', (): void => {
  const tree = numTree();
  const stats = tree.getStats();

  assert.deepEqual(stats, {
    height: 1,
    leafCount: 1,
    branchCount: 0,
    entryCount: 0,
  });
});

void test('getStats returns correct stats after inserts triggering splits', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 6; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  const stats = tree.getStats();
  assert.equal(stats.entryCount, 6);
  // With maxLeafEntries=3: 6 entries require at least 2 leaves and 1 branch
  assert.equal(
    stats.height,
    2,
    'expected height 2 after splits with 6 entries and maxLeaf=3',
  );
  assert.equal(
    stats.leafCount,
    3,
    'expected 3 leaves for 6 entries with maxLeaf=3',
  );
  assert.equal(
    stats.branchCount,
    1,
    'expected 1 branch node for 3 leaves with maxBranch=3',
  );
  tree.assertInvariants();
});

void test('getStats reflects changes after remove', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 6; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  const before = tree.getStats();
  tree.remove(3);
  const after = tree.getStats();

  assert.equal(after.entryCount, before.entryCount - 1);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Iterator after mutation
// ---------------------------------------------------------------------------

void test('iterator does not crash when tree is mutated during iteration', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 9; i += 1) {
    tree.put(i * 10, `v${String(i * 10)}`);
  }

  const iter = tree.entries();
  const collected: BTreeEntry<number, string>[] = [];

  // Consume a few entries
  const first = iter.next();
  assert.equal(first.done, false);
  collected.push(first.value);

  const second = iter.next();
  assert.equal(second.done, false);
  collected.push(second.value);

  // Mutate during iteration
  tree.put(25, 'v25');
  tree.put(200, 'v200');

  // Continue iterating — should not crash
  let result = iter.next();
  while (!result.done) {
    collected.push(result.value);
    result = iter.next();
  }

  // Verify no corruption: all collected entries have valid keys and values
  for (const entry of collected) {
    assert.equal(typeof entry.key, 'number');
    assert.equal(typeof entry.value, 'string');
  }

  // The iterator must see at least the original 9 entries
  assert.ok(
    collected.length >= 9,
    `expected at least 9 entries, got ${collected.length}`,
  );

  // Keys must be in non-descending order (iterator contract)
  for (let i = 1; i < collected.length; i += 1) {
    assert.ok(
      collected[i - 1].key <= collected[i].key,
      `out-of-order keys at index ${i - 1}: ${collected[i - 1].key} > ${collected[i].key}`,
    );
  }

  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Cross-leaf duplicate replace (WI5 fix)
// ---------------------------------------------------------------------------

void test('replace mode correctly replaces duplicate at leaf boundary', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });

  // Insert entries to force a split: with maxLeafEntries: 3,
  // inserting 1, 2, 3, 4 will split the first leaf.
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  tree.put(3, 'v3');
  tree.put(4, 'v4');
  tree.put(5, 'v5');

  // Now replace the last entry in the first leaf.
  // After split, key 3 is likely the boundary. Replace it.
  tree.put(3, 'replaced');

  assert.equal(tree.get(3), 'replaced');
  assert.equal(tree.size(), 5);
  tree.assertInvariants();
});

void test('replace mode works for key at the very start of a second leaf', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });

  // Force multiple leaves
  tree.put(10, 'v10');
  tree.put(20, 'v20');
  tree.put(30, 'v30');
  tree.put(40, 'v40');
  tree.put(50, 'v50');
  tree.put(60, 'v60');

  // Replace a key that sits at a leaf boundary
  tree.put(40, 'replaced40');

  assert.equal(tree.get(40), 'replaced40');
  assert.equal(tree.size(), 6);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Reverse iterator after mutation
// ---------------------------------------------------------------------------

void test('reverse iterator does not crash when tree is mutated during iteration', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 9; i += 1) {
    tree.put(i * 10, `v${String(i * 10)}`);
  }

  const iter = tree.entriesReversed();
  const collected: BTreeEntry<number, string>[] = [];

  // Consume a few entries from the end
  const first = iter.next();
  assert.equal(first.done, false);
  collected.push(first.value);

  const second = iter.next();
  assert.equal(second.done, false);
  collected.push(second.value);

  // Mutate during reverse iteration
  tree.put(5, 'v5');
  tree.remove(50);

  // Continue iterating — should not crash
  let result = iter.next();
  while (!result.done) {
    collected.push(result.value);
    result = iter.next();
  }

  // All collected entries must have valid types
  for (const entry of collected) {
    assert.equal(typeof entry.key, 'number');
    assert.equal(typeof entry.value, 'string');
  }

  // Keys must be in non-ascending order (reverse iterator contract)
  for (let i = 1; i < collected.length; i += 1) {
    assert.ok(
      collected[i - 1].key >= collected[i].key,
      `out-of-order reverse keys at index ${i - 1}: ${collected[i - 1].key} < ${collected[i].key}`,
    );
  }

  tree.assertInvariants();
});
