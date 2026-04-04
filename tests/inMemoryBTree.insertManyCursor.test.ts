import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  InMemoryBTree,
  type EntryId,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
    ...opts,
  });

interface KV { key: number; value: string }

const seedEven = (tree: InMemoryBTree<number, string>, count: number): void => {
  for (let i = 0; i < count; i += 1) {
    tree.put(i * 2, `even${String(i)}`);
  }
};

const oddBatch = (count: number): KV[] => {
  const batch: KV[] = [];
  for (let i = 0; i < count; i += 1) {
    batch.push({ key: i * 2 + 1, value: `odd${String(i)}` });
  }
  return batch;
};

const singleInsertAll = (tree: InMemoryBTree<number, string>, batch: KV[]): EntryId[] => {
  const ids: EntryId[] = [];
  for (const entry of batch) {
    ids.push(tree.put(entry.key, entry.value));
  }
  return ids;
};

// ---------------------------------------------------------------------------
// Test 1: Batch vs single-insert equivalence
// ---------------------------------------------------------------------------

void describe('putMany cursor: batch vs single-insert equivalence', (): void => {
  void test('replace policy — batch with some existing keys', (): void => {
    const treeA = numTree({ duplicateKeys: 'replace' });
    const treeB = numTree({ duplicateKeys: 'replace' });
    seedEven(treeA, 100);
    seedEven(treeB, 100);

    const batch: KV[] = oddBatch(100);
    batch.push({ key: 200, value: 'replace0' });
    batch.push({ key: 202, value: 'replace2' });
    batch.push({ key: 204, value: 'replace4' });
    batch.sort((a, b) => a.key - b.key);

    const idsA = treeA.putMany(batch);
    const idsB = singleInsertAll(treeB, batch);

    assert.deepEqual(idsA, idsB);
    assert.deepEqual(treeA.snapshot(), treeB.snapshot());
    treeA.assertInvariants();
    treeB.assertInvariants();
  });

  void test('reject policy — batch of entirely new keys', (): void => {
    const treeA = numTree({ duplicateKeys: 'reject' });
    const treeB = numTree({ duplicateKeys: 'reject' });
    seedEven(treeA, 100);
    seedEven(treeB, 100);

    const batch = oddBatch(100);
    const idsA = treeA.putMany(batch);
    const idsB = singleInsertAll(treeB, batch);

    assert.deepEqual(idsA, idsB);
    assert.deepEqual(treeA.snapshot(), treeB.snapshot());
    treeA.assertInvariants();
    treeB.assertInvariants();
  });

  void test('allow policy — batch with duplicate keys', (): void => {
    const treeA = numTree({ duplicateKeys: 'allow' });
    const treeB = numTree({ duplicateKeys: 'allow' });
    seedEven(treeA, 100);
    seedEven(treeB, 100);

    const batch: KV[] = oddBatch(50);
    batch.push({ key: 50, value: 'dup50a' });
    batch.push({ key: 50, value: 'dup50b' });
    batch.push({ key: 100, value: 'dup100' });
    batch.sort((a, b) => a.key - b.key);

    const idsA = treeA.putMany(batch);
    const idsB = singleInsertAll(treeB, batch);

    assert.deepEqual(idsA, idsB);
    assert.deepEqual(treeA.snapshot(), treeB.snapshot());
    treeA.assertInvariants();
    treeB.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Non-empty tree + large sorted batch crossing many splits
// ---------------------------------------------------------------------------

void describe('putMany cursor: large batch crossing many splits', (): void => {
  void test('200 new entries interleaved into 50 existing entries', (): void => {
    const tree = numTree({ maxLeafEntries: 8 });

    for (let i = 0; i < 50; i += 1) {
      tree.put(i * 5, `init${String(i)}`);
    }

    const batch: KV[] = [];
    for (let i = 0; i < 250; i += 1) {
      if (i % 5 !== 0) {
        batch.push({ key: i, value: `new${String(i)}` });
      }
    }

    const ids = tree.putMany(batch);

    assert.equal(ids.length, 200);
    assert.equal(tree.size(), 250);

    const uniqueIds = new Set<EntryId>(ids);
    assert.equal(uniqueIds.size, 200);

    const snap = tree.snapshot();
    assert.equal(snap.length, 250);
    for (let i = 1; i < snap.length; i += 1) {
      assert.ok(snap[i - 1].key <= snap[i].key);
    }

    tree.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Sparse batch (scan budget fallback)
// ---------------------------------------------------------------------------

void describe('putMany cursor: sparse batch triggers fallback', (): void => {
  void test('3 entries spread across the entire key range', (): void => {
    const tree = numTree({ maxLeafEntries: 4 });

    for (let i = 0; i < 200; i += 1) {
      tree.put(i * 2, `v${String(i)}`);
    }

    const ids = tree.putMany([
      { key: 1, value: 'sparse1' },
      { key: 201, value: 'sparse201' },
      { key: 397, value: 'sparse397' },
    ]);

    assert.equal(ids.length, 3);
    assert.equal(tree.size(), 203);
    assert.equal(tree.get(1), 'sparse1');
    assert.equal(tree.get(201), 'sparse201');
    assert.equal(tree.get(397), 'sparse397');
    tree.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Duplicate key in batch against existing tree
// ---------------------------------------------------------------------------

void describe('putMany cursor: duplicate key handling - replace', (): void => {
  void test('replace policy — replaced keys reuse original EntryIds', (): void => {
    const tree = numTree({ duplicateKeys: 'replace', enableEntryIdLookup: true });
    tree.put(1, 'a');
    const id2 = tree.put(2, 'b');
    tree.put(3, 'c');
    const id4 = tree.put(4, 'd');
    tree.put(5, 'e');

    const ids = tree.putMany([
      { key: 2, value: 'B' },
      { key: 4, value: 'D' },
      { key: 6, value: 'F' },
    ]);

    assert.equal(tree.size(), 6);
    assert.equal(tree.get(2), 'B');
    assert.equal(tree.get(4), 'D');
    assert.equal(ids[0], id2);
    assert.equal(ids[1], id4);
    tree.assertInvariants();
  });

  void test('replace policy — matches single-insert snapshot', (): void => {
    const treeA = numTree({ duplicateKeys: 'replace' });
    const treeB = numTree({ duplicateKeys: 'replace' });
    for (const k of [1, 2, 3, 4, 5]) {
      treeA.put(k, String.fromCharCode(96 + k));
      treeB.put(k, String.fromCharCode(96 + k));
    }
    const batch: KV[] = [
      { key: 2, value: 'B' },
      { key: 4, value: 'D' },
      { key: 6, value: 'F' },
    ];
    treeA.putMany(batch);
    singleInsertAll(treeB, batch);
    assert.deepEqual(treeA.snapshot(), treeB.snapshot());
    treeA.assertInvariants();
  });
});

void describe('putMany cursor: duplicate key handling - reject', (): void => {
  void test('reject policy — all new keys succeed', (): void => {
    const tree = numTree({ duplicateKeys: 'reject' });
    tree.put(1, 'a');
    tree.put(2, 'b');
    tree.put(3, 'c');

    const ids = tree.putMany([
      { key: 4, value: 'd' },
      { key: 5, value: 'e' },
    ]);

    assert.equal(ids.length, 2);
    assert.equal(tree.size(), 5);
    assert.equal(tree.get(4), 'd');
    assert.equal(tree.get(5), 'e');
    tree.assertInvariants();
  });

  void test('reject policy — collision with existing key throws', (): void => {
    const tree = numTree({ duplicateKeys: 'reject' });
    tree.put(1, 'a');
    tree.put(3, 'c');
    tree.put(5, 'e');

    assert.throws(
      () => tree.putMany([{ key: 2, value: 'b' }, { key: 3, value: 'dup' }]),
      (err: unknown) => err instanceof Error && err.constructor.name === 'BTreeValidationError',
    );
  });
});

void describe('putMany cursor: duplicate key handling - allow', (): void => {
  void test('allow policy — same key in batch and tree', (): void => {
    const tree = numTree({ duplicateKeys: 'allow' });
    tree.put(5, 'a');

    tree.putMany([
      { key: 5, value: 'b' },
      { key: 5, value: 'c' },
    ]);

    assert.equal(tree.size(), 3);
    const entries = tree.range(5, 5);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].value, 'a');
    assert.equal(entries[1].value, 'b');
    assert.equal(entries[2].value, 'c');
    tree.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Duplicate within batch AND against existing tree (allow policy)
// ---------------------------------------------------------------------------

void describe('putMany cursor: allow policy with duplicates in batch and tree', (): void => {
  void test('duplicates in batch merge correctly with existing entries', (): void => {
    const tree = numTree({ duplicateKeys: 'allow' });
    tree.put(1, 'x');
    tree.put(3, 'y');
    tree.put(5, 'z');

    tree.putMany([
      { key: 1, value: 'a' },
      { key: 1, value: 'b' },
      { key: 3, value: 'c' },
      { key: 5, value: 'd' },
      { key: 5, value: 'e' },
    ]);

    assert.equal(tree.size(), 8);

    const range1 = tree.range(1, 1);
    assert.equal(range1.length, 3);
    assert.equal(range1[0].value, 'x');
    assert.equal(range1[1].value, 'a');
    assert.equal(range1[2].value, 'b');

    const range3 = tree.range(3, 3);
    assert.equal(range3.length, 2);
    assert.equal(range3[0].value, 'y');
    assert.equal(range3[1].value, 'c');

    const range5 = tree.range(5, 5);
    assert.equal(range5.length, 3);
    assert.equal(range5[0].value, 'z');
    assert.equal(range5[1].value, 'd');
    assert.equal(range5[2].value, 'e');

    tree.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// putMany — hint budget exhaustion forces root descent fallback
// ---------------------------------------------------------------------------

void test('putMany with widely spaced keys triggers hint budget fallback', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 4,
    maxBranchChildren: 3,
  });

  // Pre-fill tree to create many leaves — budget = ceil(log2(entryCount+2))
  for (let i = 0; i < 100; i += 1) {
    tree.put(i, `existing-${i}`);
  }
  tree.assertInvariants();

  // Insert batch with keys far apart — each consecutive pair spans > log2(102) ≈ 7 leaves
  // This forces findLeafFromHint to exhaust budget and fall back to root descent
  const widelySpacedEntries = [
    { key: 200, value: 'a' },
    { key: 300, value: 'b' },
    { key: 400, value: 'c' },
    { key: 500, value: 'd' },
  ];
  const ids = tree.putMany(widelySpacedEntries);
  assert.equal(ids.length, 4);
  assert.equal(tree.size(), 104);

  // Verify all entries are accessible
  assert.equal(tree.get(200), 'a');
  assert.equal(tree.get(500), 'd');
  tree.assertInvariants();

  // Verify ordering
  const snap = tree.snapshot();
  for (let i = 1; i < snap.length; i += 1) {
    assert.ok(snap[i - 1].key < snap[i].key);
  }
});
