import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryBTree,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------

void test('get returns value for existing key', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  tree.put(10, 'ten');
  tree.put(20, 'twenty');
  tree.put(5, 'five');

  assert.equal(tree.get(10), 'ten');
  assert.equal(tree.get(20), 'twenty');
  assert.equal(tree.get(5), 'five');
  tree.assertInvariants();
});

void test('get returns null for missing key', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  tree.put(10, 'ten');
  assert.equal(tree.get(42), null);
  tree.assertInvariants();
});

void test('get returns null on empty tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  assert.equal(tree.get(1), null);
});

void test('get returns first matching value when duplicateKeys is allow', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  tree.put(7, 'first');
  tree.put(7, 'second');
  tree.put(7, 'third');

  assert.equal(tree.get(7), 'first');
  tree.assertInvariants();
});

void test('get returns replaced value when duplicateKeys is replace', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
  });

  tree.put(5, 'original');
  tree.put(5, 'replaced');

  assert.equal(tree.get(5), 'replaced');
  tree.assertInvariants();
});

void test('get works across leaf boundaries with many entries', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  for (let i = 0; i < 30; i += 1) {
    tree.put(i, i * 10);
  }

  for (let i = 0; i < 30; i += 1) {
    assert.equal(tree.get(i), i * 10);
  }
  assert.equal(tree.get(30), null);
  assert.equal(tree.get(-1), null);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// peekLast()
// ---------------------------------------------------------------------------

void test('peekLast returns null on empty tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  assert.equal(tree.peekLast(), null);
});

void test('peekLast returns the largest key entry without removing it', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  tree.put(10, 'v10');
  const id30 = tree.put(30, 'v30');
  tree.put(20, 'v20');

  const last = tree.peekLast();
  assert.deepEqual(last, { entryId: id30, key: 30, value: 'v30' });
  assert.equal(tree.size(), 3);
  assert.deepEqual(tree.peekLast(), last);
  tree.assertInvariants();
});

void test('peekLast returns last insertion-order entry for duplicate keys', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  tree.put(5, 'a');
  tree.put(5, 'b');
  const idC = tree.put(5, 'c');

  assert.deepEqual(tree.peekLast(), { entryId: idC, key: 5, value: 'c' });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// popLast()
// ---------------------------------------------------------------------------

void test('popLast returns null on empty tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  assert.equal(tree.popLast(), null);
});

void test('popLast removes entries in reverse key order', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const id1 = tree.put(1, 'v1');
  const id2 = tree.put(2, 'v2');
  const id4 = tree.put(4, 'v4');

  assert.deepEqual(tree.popLast(), { entryId: id4, key: 4, value: 'v4' });
  assert.deepEqual(tree.popLast(), { entryId: id2, key: 2, value: 'v2' });
  assert.deepEqual(tree.popLast(), { entryId: id1, key: 1, value: 'v1' });
  assert.equal(tree.popLast(), null);

  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('popLast removes last insertion-order entry for duplicate keys', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  const idA = tree.put(5, 'a');
  const idB = tree.put(5, 'b');
  const idC = tree.put(5, 'c');

  assert.deepEqual(tree.popLast(), { entryId: idC, key: 5, value: 'c' });
  assert.deepEqual(tree.popLast(), { entryId: idB, key: 5, value: 'b' });
  assert.deepEqual(tree.popLast(), { entryId: idA, key: 5, value: 'a' });
  assert.equal(tree.popLast(), null);
  tree.assertInvariants();
});

void test('popLast preserves invariants through split and merge for small capacities', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  for (let i = 0; i < 30; i += 1) {
    tree.put(i, i * 10);
  }

  const statsAfterInsert = tree.getStats();
  assert.equal(tree.size(), 30);
  assert.ok(statsAfterInsert.height > 1);
  tree.assertInvariants();

  for (let i = 29; i >= 0; i -= 1) {
    const entry = tree.popLast();
    assert.deepEqual(entry!.key, i);
    assert.deepEqual(entry!.value, i * 10);
    tree.assertInvariants();
  }

  assert.equal(tree.size(), 0);
  assert.equal(tree.popLast(), null);
});

void test('popLast with entryIdLookup cleans up entry keys', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    enableEntryIdLookup: true,
  });

  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');

  tree.popLast();
  assert.equal(tree.peekById(id2), null);
  assert.deepEqual(tree.peekById(id1), { entryId: id1, key: 1, value: 'a' });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Composite key type
// ---------------------------------------------------------------------------

void test('supports non-number key types via comparator', (): void => {
  interface CompositeKey {
    readonly timestamp: number;
    readonly sequence: number;
  }

  const comparator = (left: CompositeKey, right: CompositeKey): number => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.sequence - right.sequence;
  };

  const tree = new InMemoryBTree<CompositeKey, string>({
    compareKeys: comparator,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const idB = tree.put({ timestamp: 10, sequence: 2 }, 'b');
  const idA = tree.put({ timestamp: 10, sequence: 1 }, 'a');
  tree.put({ timestamp: 11, sequence: 1 }, 'c');

  assert.deepEqual(
    tree.range({ timestamp: 10, sequence: 1 }, { timestamp: 10, sequence: 2 }),
    [
      { entryId: idA, key: { timestamp: 10, sequence: 1 }, value: 'a' },
      { entryId: idB, key: { timestamp: 10, sequence: 2 }, value: 'b' },
    ],
  );

  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// popLast() - stress test with autoScale and heavy rebalance
// ---------------------------------------------------------------------------

void test('popLast() stress: draining 1000 entries with autoScale preserves invariants', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  for (let i = 0; i < 1000; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 1000);

  for (let i = 999; i >= 0; i -= 1) {
    const entry = tree.popLast();
    assert.notEqual(entry, null);
    assert.equal(entry!.key, i);
  }

  assert.equal(tree.size(), 0);
  assert.equal(tree.popLast(), null);
  tree.assertInvariants();
});
