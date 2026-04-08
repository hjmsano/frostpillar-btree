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

// ===========================================================================
// entriesReversed()
// ===========================================================================

void test('entriesReversed() returns empty iterator for empty tree', (): void => {
  const tree = numTree();
  assert.deepEqual([...tree.entriesReversed()], []);
});

void test('entriesReversed() returns all entries in descending comparator order', (): void => {
  const tree = numTree();
  const id10 = tree.put(10, 'v10');
  const id5 = tree.put(5, 'v5');
  const id20 = tree.put(20, 'v20');

  assert.deepEqual(
    [...tree.entriesReversed()],
    [
      { entryId: id20, key: 20, value: 'v20' },
      { entryId: id10, key: 10, value: 'v10' },
      { entryId: id5, key: 5, value: 'v5' },
    ],
  );
  tree.assertInvariants();
});

void test('entriesReversed() visits duplicate keys in reverse insertion order', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  const idA = tree.put(7, 'a');
  const idB = tree.put(7, 'b');
  const idC = tree.put(7, 'c');

  assert.deepEqual(
    [...tree.entriesReversed()],
    [
      { entryId: idC, key: 7, value: 'c' },
      { entryId: idB, key: 7, value: 'b' },
      { entryId: idA, key: 7, value: 'a' },
    ],
  );
  tree.assertInvariants();
});

void test('entriesReversed() traverses across multiple leaf boundaries', (): void => {
  const tree = numTree();
  const expected: BTreeEntry<number, string>[] = [];
  for (let i = 0; i < 30; i += 1) {
    const id = tree.put(i, `v${String(i)}`);
    expected.push({ entryId: id, key: i, value: `v${String(i)}` });
  }

  assert.deepEqual([...tree.entriesReversed()], expected.reverse());
  tree.assertInvariants();
});

void test('entriesReversed() is the reverse of entries()', (): void => {
  const tree = numTree();
  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  const forward = [...tree.entries()];
  const reversed = [...tree.entriesReversed()];
  assert.deepEqual(reversed, [...forward].reverse());
});

void test('entriesReversed() single entry', (): void => {
  const tree = numTree();
  const id = tree.put(42, 'only');

  assert.deepEqual(
    [...tree.entriesReversed()],
    [{ entryId: id, key: 42, value: 'only' }],
  );
});

void test('entriesReversed() iterator exhausts correctly', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  const iter = tree.entriesReversed();
  const first = iter.next();
  assert.equal(first.done, false);
  assert.equal(first.value.key, 1);

  const second = iter.next();
  assert.equal(second.done, true);
  assert.equal(second.value, undefined);
});

void test('entriesReversed() iterator is itself iterable', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  const iter = tree.entriesReversed();
  const collected: BTreeEntry<number, string>[] = [];
  for (const entry of iter) {
    collected.push(entry);
  }
  assert.equal(collected.length, 2);
  assert.equal(collected[0].key, 2);
  assert.equal(collected[1].key, 1);
});

// ===========================================================================
// range() with bound options
// ===========================================================================

// --- exclusive lower bound ---

void test('range with exclusive lower bound excludes startKey', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  const id3 = tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { lowerBound: 'exclusive' }), [
    { entryId: id2, key: 2, value: 'b' },
    { entryId: id3, key: 3, value: 'c' },
  ]);
});

// --- exclusive upper bound ---

void test('range with exclusive upper bound excludes endKey', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { upperBound: 'exclusive' }), [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
  ]);
});

// --- both exclusive ---

void test('range with both bounds exclusive', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  tree.put(3, 'c');

  assert.deepEqual(
    tree.range(1, 3, { lowerBound: 'exclusive', upperBound: 'exclusive' }),
    [{ entryId: id2, key: 2, value: 'b' }],
  );
});

void test('range with both exclusive on same key returns empty', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  assert.deepEqual(
    tree.range(5, 5, { lowerBound: 'exclusive', upperBound: 'exclusive' }),
    [],
  );
});

// --- explicit inclusive (same as default) ---

void test('range with explicit inclusive bounds matches default', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  const id3 = tree.put(3, 'c');

  assert.deepEqual(
    tree.range(1, 3, { lowerBound: 'inclusive', upperBound: 'inclusive' }),
    tree.range(1, 3),
  );
  // Verify result is correct too
  assert.deepEqual(
    tree.range(1, 3, { lowerBound: 'inclusive', upperBound: 'inclusive' }),
    [
      { entryId: id1, key: 1, value: 'a' },
      { entryId: id2, key: 2, value: 'b' },
      { entryId: id3, key: 3, value: 'c' },
    ],
  );
});

// --- empty tree ---

void test('range with options returns empty for empty tree', (): void => {
  const tree = numTree();
  assert.deepEqual(tree.range(1, 10, { lowerBound: 'exclusive' }), []);
  assert.deepEqual(tree.range(1, 10, { upperBound: 'exclusive' }), []);
  assert.deepEqual(
    tree.range(1, 10, { lowerBound: 'exclusive', upperBound: 'exclusive' }),
    [],
  );
});

// --- start > end ---

void test('range with options returns empty when start > end', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(5, 'e');
  assert.deepEqual(tree.range(5, 1, { lowerBound: 'exclusive' }), []);
});

// --- duplicate keys with exclusive bounds ---

void test('range with exclusive lower bound and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  const id7 = tree.put(7, 'c');

  // Exclusive lower: skip all entries with key === 5
  assert.deepEqual(tree.range(5, 7, { lowerBound: 'exclusive' }), [
    { entryId: id7, key: 7, value: 'c' },
  ]);
});

void test('range with exclusive upper bound and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  const id3 = tree.put(3, 'x');
  tree.put(5, 'a');
  tree.put(5, 'b');

  // Exclusive upper: skip all entries with key === 5
  assert.deepEqual(tree.range(3, 5, { upperBound: 'exclusive' }), [
    { entryId: id3, key: 3, value: 'x' },
  ]);
});

void test('range with exclusive lower on duplicate key returns remaining duplicates above', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  const id5a = tree.put(5, 'a');
  const id5b = tree.put(5, 'b');
  const id7 = tree.put(7, 'c');

  // inclusive range(5, 7) returns all
  assert.deepEqual(tree.range(5, 7), [
    { entryId: id5a, key: 5, value: 'a' },
    { entryId: id5b, key: 5, value: 'b' },
    { entryId: id7, key: 7, value: 'c' },
  ]);

  // exclusive lower: excludes all with key === 5
  assert.deepEqual(tree.range(5, 7, { lowerBound: 'exclusive' }), [
    { entryId: id7, key: 7, value: 'c' },
  ]);
});

// --- boundary equality: exclusive on exact boundary ---

void test('range exclusive lower where startKey not in tree', (): void => {
  const tree = numTree();
  const id3 = tree.put(3, 'c');
  const id5 = tree.put(5, 'e');

  // exclusive lower 2 -> still includes 3 and 5
  assert.deepEqual(tree.range(2, 5, { lowerBound: 'exclusive' }), [
    { entryId: id3, key: 3, value: 'c' },
    { entryId: id5, key: 5, value: 'e' },
  ]);
});

void test('range exclusive upper where endKey not in tree', (): void => {
  const tree = numTree();
  const id3 = tree.put(3, 'c');
  const id5 = tree.put(5, 'e');

  // exclusive upper 6 -> still includes 3 and 5
  assert.deepEqual(tree.range(3, 6, { upperBound: 'exclusive' }), [
    { entryId: id3, key: 3, value: 'c' },
    { entryId: id5, key: 5, value: 'e' },
  ]);
});

// --- across multiple leaf boundaries ---

void test('range with exclusive bounds across multiple leaves', (): void => {
  const tree = numTree();
  for (let i = 0; i < 30; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  const result = tree.range(5, 25, {
    lowerBound: 'exclusive',
    upperBound: 'exclusive',
  });
  assert.equal(result.length, 19); // 6..24
  assert.equal(result[0].key, 6);
  assert.equal(result[result.length - 1].key, 24);
  tree.assertInvariants();
});

// --- exclusive bounds at tree min/max keys ---

void test('range with exclusive lower bound at tree minimum key returns all but first', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  const id3 = tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { lowerBound: 'exclusive' }), [
    { entryId: id2, key: 2, value: 'b' },
    { entryId: id3, key: 3, value: 'c' },
  ]);
});

void test('range with exclusive upper bound at tree maximum key returns all but last', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');
  tree.put(3, 'c');

  assert.deepEqual(tree.range(1, 3, { upperBound: 'exclusive' }), [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
  ]);
});

void test('range with both bounds exclusive and duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  const id7a = tree.put(7, 'c');
  const id7b = tree.put(7, 'd');
  tree.put(10, 'e');
  tree.put(10, 'f');

  // Both bounds exclusive: excludes all 5s and all 10s, returns only 7s
  assert.deepEqual(
    tree.range(5, 10, { lowerBound: 'exclusive', upperBound: 'exclusive' }),
    [
      { entryId: id7a, key: 7, value: 'c' },
      { entryId: id7b, key: 7, value: 'd' },
    ],
  );
});

void test('range/count/deleteRange consistency for all 4 bound combinations', (): void => {
  const combos: {
    lowerBound?: 'inclusive' | 'exclusive';
    upperBound?: 'inclusive' | 'exclusive';
  }[] = [
    { lowerBound: 'inclusive', upperBound: 'inclusive' },
    { lowerBound: 'inclusive', upperBound: 'exclusive' },
    { lowerBound: 'exclusive', upperBound: 'inclusive' },
    { lowerBound: 'exclusive', upperBound: 'exclusive' },
  ];

  for (const opts of combos) {
    const tree = numTree();
    for (let i = 0; i < 20; i += 1) tree.put(i, `v${i}`);
    const rangeResult = tree.range(5, 15, opts);
    const countResult = tree.count(5, 15, opts);
    assert.equal(
      rangeResult.length,
      countResult,
      `range vs count mismatch for ${JSON.stringify(opts)}`,
    );
  }
});
