import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryBTree,
} from '../src/index.js';

void test('range query returns sorted inclusive entries and handles reversed bounds', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const id20 = tree.put(20, 'v20');
  const id10 = tree.put(10, 'v10');
  tree.put(30, 'v30');
  const id15 = tree.put(15, 'v15');

  assert.deepEqual(tree.range(10, 20), [
    { entryId: id10, key: 10, value: 'v10' },
    { entryId: id15, key: 15, value: 'v15' },
    { entryId: id20, key: 20, value: 'v20' },
  ]);

  assert.deepEqual(tree.range(21, 19), []);
  tree.assertInvariants();
});

void test('range query handles empty tree, single-key bounds, and full-tree bounds', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  assert.deepEqual(tree.range(5, 5), []);
  assert.deepEqual(tree.range(1, 9), []);

  const id20 = tree.put(20, 'v20');
  const id10 = tree.put(10, 'v10');
  const id5 = tree.put(5, 'v5');
  const id15 = tree.put(15, 'v15');

  assert.deepEqual(tree.range(5, 5), [{ entryId: id5, key: 5, value: 'v5' }]);
  assert.deepEqual(tree.range(5, 20), [
    { entryId: id5, key: 5, value: 'v5' },
    { entryId: id10, key: 10, value: 'v10' },
    { entryId: id15, key: 15, value: 'v15' },
    { entryId: id20, key: 20, value: 'v20' },
  ]);
  assert.deepEqual(tree.range(21, 19), []);

  tree.assertInvariants();
});

void test('equal keys preserve insertion order', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  const idFirst = tree.put(7, 'first');
  const idSecond = tree.put(7, 'second');
  const idThird = tree.put(7, 'third');

  assert.deepEqual(tree.range(7, 7), [
    { entryId: idFirst, key: 7, value: 'first' },
    { entryId: idSecond, key: 7, value: 'second' },
    { entryId: idThird, key: 7, value: 'third' },
  ]);

  tree.assertInvariants();
});

void test('range(key, key) returns all duplicate-key entries across leaf boundaries', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  const expected: { entryId: number; key: number; value: string }[] = [];
  for (let index = 0; index < 9; index += 1) {
    const id = tree.put(7, `v${String(index)}`);
    expected.push({ entryId: id, key: 7, value: `v${String(index)}` });
  }

  assert.deepEqual(tree.range(7, 7), expected);
  tree.assertInvariants();
});

void test('remove returns earliest equal-key entry and null when missing', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  const idA = tree.put(5, 'a');
  const idB = tree.put(5, 'b');
  const idC = tree.put(6, 'c');

  assert.deepEqual(tree.remove(5), { entryId: idA, key: 5, value: 'a' });
  assert.deepEqual(tree.range(5, 6), [
    { entryId: idB, key: 5, value: 'b' },
    { entryId: idC, key: 6, value: 'c' },
  ]);

  assert.equal(tree.remove(42), null);
  tree.assertInvariants();
});

void test('popFirst removes entries in key order', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const id4 = tree.put(4, 'v4');
  const id1 = tree.put(1, 'v1');
  const id2 = tree.put(2, 'v2');

  assert.deepEqual(tree.popFirst(), { entryId: id1, key: 1, value: 'v1' });
  assert.deepEqual(tree.popFirst(), { entryId: id2, key: 2, value: 'v2' });
  assert.deepEqual(tree.popFirst(), { entryId: id4, key: 4, value: 'v4' });
  assert.equal(tree.popFirst(), null);

  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('split and merge paths preserve invariants for small capacities', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const ids = new Map<number, number>();
  for (let index = 0; index < 30; index += 1) {
    ids.set(index, tree.put(index, index * 10));
  }

  const statsAfterInsert = tree.getStats();
  assert.equal(tree.size(), 30);
  assert.ok(statsAfterInsert.height > 1);
  tree.assertInvariants();

  for (let index = 0; index < 30; index += 1) {
    const id = ids.get(index)!;
    assert.deepEqual(tree.remove(index), { entryId: id, key: index, value: index * 10 });
    tree.assertInvariants();
  }

  assert.equal(tree.size(), 0);
  const statsAfterRemove = tree.getStats();
  assert.equal(statsAfterRemove.entryCount, 0);
});

void test('snapshot returns an empty array on an empty tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  assert.deepEqual(tree.snapshot(), []);
  tree.assertInvariants();
});

void test('hasKey reflects existence across insert and remove operations', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'allow',
    enableEntryIdLookup: true,
  });

  assert.equal(tree.hasKey(10), false);
  const idA = tree.put(10, 'a');
  const idB = tree.put(10, 'b');
  assert.equal(tree.hasKey(10), true);

  tree.removeById(idA);
  assert.equal(tree.hasKey(10), true);

  tree.removeById(idB);
  assert.equal(tree.hasKey(10), false);
  tree.assertInvariants();
});

void test('removeById and updateById target exact duplicate-key entries', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'allow',
    enableEntryIdLookup: true,
  });

  const idA = tree.put(10, 'a');
  const idB = tree.put(10, 'b');

  assert.deepEqual(tree.updateById(idB, 'B'), { entryId: idB, key: 10, value: 'B' });
  assert.deepEqual(tree.peekById(idA), { entryId: idA, key: 10, value: 'a' });
  assert.deepEqual(tree.peekById(idB), { entryId: idB, key: 10, value: 'B' });
  assert.deepEqual(tree.removeById(idA), { entryId: idA, key: 10, value: 'a' });
  assert.deepEqual(tree.snapshot(), [{ entryId: idB, key: 10, value: 'B' }]);
});

void test('updateById returns the post-update entry for repeated updates', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    enableEntryIdLookup: true,
  });

  const id = tree.put(1, 'one');
  assert.deepEqual(tree.updateById(id, 'ONE'), { entryId: id, key: 1, value: 'ONE' });
  assert.deepEqual(tree.updateById(id, 'UNO'), { entryId: id, key: 1, value: 'UNO' });
  assert.deepEqual(tree.peekById(id), { entryId: id, key: 1, value: 'UNO' });
  assert.deepEqual(tree.snapshot(), [{ entryId: id, key: 1, value: 'UNO' }]);
});

void test('repeated popFirst and insert triggers leaf offset compaction', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    maxLeafEntries: 8,
    maxBranchChildren: 4,
  });
  for (let i = 0; i < 20; i += 1) tree.put(i, String(i));
  for (let round = 0; round < 50; round += 1) {
    tree.popFirst();
    tree.put(round + 20, String(round + 20));
  }
  assert.equal(tree.size(), 20);
  tree.assertInvariants();
  const entries = tree.snapshot();
  for (let i = 1; i < entries.length; i += 1) {
    assert.ok(entries[i - 1].key < entries[i].key);
  }
});

void test('popFirst exactly at 50% offset threshold triggers compaction without data loss', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 8,
    maxBranchChildren: 4,
  });
  // Insert exactly 8 entries into a single leaf
  for (let i = 0; i < 8; i += 1) tree.put(i, String(i));
  // Pop 4 entries (50% of 8) — compaction should trigger on the 4th pop
  for (let i = 0; i < 4; i += 1) tree.popFirst();
  assert.equal(tree.size(), 4);
  tree.assertInvariants();

  // Verify remaining entries are correct
  const snap = tree.snapshot();
  assert.deepEqual(snap.map((e) => e.key), [4, 5, 6, 7]);

  // Now insert and verify no corruption
  tree.put(10, '10');
  tree.put(11, '11');
  assert.equal(tree.size(), 6);
  tree.assertInvariants();
  const snapAfter = tree.snapshot();
  for (let i = 1; i < snapAfter.length; i += 1) {
    assert.ok(snapAfter[i - 1].key < snapAfter[i].key);
  }
});

void test('mixed popFirst and insert across leaf boundaries preserves all entries', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    maxLeafEntries: 4,
    maxBranchChildren: 3,
  });
  // Fill tree to force multiple leaves
  for (let i = 0; i < 20; i += 1) tree.put(i, `v${i}`);
  tree.assertInvariants();

  // Interleave pops and inserts heavily
  for (let round = 0; round < 30; round += 1) {
    tree.popFirst();
    tree.put(20 + round, `v${20 + round}`);
    // Periodically pop from first and verify
    if (round % 5 === 0) {
      tree.assertInvariants();
    }
  }
  assert.equal(tree.size(), 20);
  tree.assertInvariants();

  // Verify range query still works correctly
  const snap = tree.snapshot();
  for (let i = 1; i < snap.length; i += 1) {
    assert.ok(snap[i - 1].key < snap[i].key, `key order violation: ${snap[i - 1].key} >= ${snap[i].key}`);
  }
  // Verify entries() matches snapshot()
  assert.deepEqual([...tree.entries()], snap);
});
