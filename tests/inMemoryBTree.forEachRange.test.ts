import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, type BTreeEntry } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numCmp = (left: number, right: number): number => left - right;

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  maxLeafEntries?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ===========================================================================
// forEachRange() - empty tree
// ===========================================================================

void test('forEachRange() is a no-op for empty tree', (): void => {
  const tree = numTree();
  const collected: BTreeEntry<number, string>[] = [];
  tree.forEachRange(1, 10, (entry) => {
    collected.push(entry);
  });
  assert.equal(collected.length, 0);
});

// ===========================================================================
// forEachRange() - basic cases
// ===========================================================================

void test('forEachRange() visits all entries in range', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  const collected: BTreeEntry<number, string>[] = [];
  tree.forEachRange(3, 7, (entry) => {
    collected.push(entry);
  });

  assert.equal(collected.length, 5);
  assert.deepEqual(
    collected.map((e) => e.key),
    [3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    collected.map((e) => e.value),
    ['v3', 'v4', 'v5', 'v6', 'v7'],
  );
});

void test('forEachRange() visits entries in ascending order', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `v${i}`);
  }

  const keys: number[] = [];
  tree.forEachRange(5, 15, (entry) => {
    keys.push(entry.key);
  });

  for (let i = 1; i < keys.length; i += 1) {
    assert.ok(
      keys[i] > keys[i - 1],
      `keys should be ascending: ${keys[i - 1]} < ${keys[i]}`,
    );
  }
});

void test('forEachRange() result matches range() output', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 30; i += 1) {
    tree.put(i, `v${i}`);
  }

  const fromRange = tree.range(5, 25);
  const fromForEach: BTreeEntry<number, string>[] = [];
  tree.forEachRange(5, 25, (entry) => {
    fromForEach.push(entry);
  });

  assert.deepEqual(fromForEach, fromRange);
});

// ===========================================================================
// forEachRange() - empty results
// ===========================================================================

void test('forEachRange() is no-op when start > end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  const collected: BTreeEntry<number, string>[] = [];
  tree.forEachRange(10, 5, (entry) => {
    collected.push(entry);
  });
  assert.equal(collected.length, 0);
});

void test('forEachRange() is no-op when both bounds exclusive and start === end', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');

  const collected: BTreeEntry<number, string>[] = [];
  tree.forEachRange(
    5,
    5,
    (entry) => {
      collected.push(entry);
    },
    {
      lowerBound: 'exclusive',
      upperBound: 'exclusive',
    },
  );
  assert.equal(collected.length, 0);
});

void test('forEachRange() is no-op when range misses all keys', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(10, 'v10');

  const collected: BTreeEntry<number, string>[] = [];
  tree.forEachRange(3, 7, (entry) => {
    collected.push(entry);
  });
  assert.equal(collected.length, 0);
});

// ===========================================================================
// forEachRange() - bound options
// ===========================================================================

void test('forEachRange() with exclusive lower bound', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 5; i += 1) {
    tree.put(i, `v${i}`);
  }

  const keys: number[] = [];
  tree.forEachRange(
    1,
    5,
    (entry) => {
      keys.push(entry.key);
    },
    { lowerBound: 'exclusive' },
  );
  assert.deepEqual(keys, [2, 3, 4, 5]);
});

void test('forEachRange() with exclusive upper bound', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 5; i += 1) {
    tree.put(i, `v${i}`);
  }

  const keys: number[] = [];
  tree.forEachRange(
    1,
    5,
    (entry) => {
      keys.push(entry.key);
    },
    { upperBound: 'exclusive' },
  );
  assert.deepEqual(keys, [1, 2, 3, 4]);
});

void test('forEachRange() with both bounds exclusive', (): void => {
  const tree = numTree();
  for (let i = 1; i <= 5; i += 1) {
    tree.put(i, `v${i}`);
  }

  const keys: number[] = [];
  tree.forEachRange(
    1,
    5,
    (entry) => {
      keys.push(entry.key);
    },
    {
      lowerBound: 'exclusive',
      upperBound: 'exclusive',
    },
  );
  assert.deepEqual(keys, [2, 3, 4]);
});

// ===========================================================================
// forEachRange() - duplicate keys
// ===========================================================================

void test('forEachRange() visits all duplicate-key entries', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');
  tree.put(10, 'd');

  const values: string[] = [];
  tree.forEachRange(5, 5, (entry) => {
    values.push(entry.value);
  });
  assert.deepEqual(values, ['a', 'b', 'c']);
});

// ===========================================================================
// forEachRange() - structural equivalence with range()
// ===========================================================================

void test('forEachRange() entries are structurally equivalent to range() output', (): void => {
  const tree = numTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');

  const entries: BTreeEntry<number, string>[] = [];
  tree.forEachRange(1, 2, (entry) => {
    entries.push(entry);
  });

  const rangeEntries = tree.range(1, 2);
  assert.deepEqual(entries, rangeEntries);
});

// ===========================================================================
// forEachRange() - multi-leaf spanning
// ===========================================================================

void test('forEachRange() spanning multiple leaves matches range()', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  const fromRange = tree.range(10, 40);
  const fromForEach: BTreeEntry<number, string>[] = [];
  tree.forEachRange(10, 40, (entry) => {
    fromForEach.push(entry);
  });

  assert.equal(fromForEach.length, fromRange.length);
  assert.deepEqual(fromForEach, fromRange);
});

void test('forEachRange() with bounds matches range() with same bounds', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });
  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  const opts = {
    lowerBound: 'exclusive' as const,
    upperBound: 'exclusive' as const,
  };
  const fromRange = tree.range(10, 40, opts);
  const fromForEach: BTreeEntry<number, string>[] = [];
  tree.forEachRange(
    10,
    40,
    (entry) => {
      fromForEach.push(entry);
    },
    opts,
  );

  assert.deepEqual(fromForEach, fromRange);
});
