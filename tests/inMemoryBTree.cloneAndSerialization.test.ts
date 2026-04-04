import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeValidationError,
  InMemoryBTree,
  type BTreeJSON,
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
// toJSON()
// ===========================================================================

void test('toJSON() on empty tree returns payload with empty entries', (): void => {
  const json = numTree().toJSON();
  assert.equal(json.version, 1);
  assert.deepEqual(json.entries, []);
  assert.equal(json.config.maxLeafEntries, 3);
  assert.equal(json.config.duplicateKeys, 'replace');
  assert.equal(json.config.enableEntryIdLookup, false);
  assert.equal(json.config.autoScale, false);
});

void test('toJSON() includes all entries as [key, value] tuples in order', (): void => {
  const tree = numTree();
  tree.put(30, 'c');
  tree.put(10, 'a');
  tree.put(20, 'b');
  assert.deepEqual(tree.toJSON().entries, [[10, 'a'], [20, 'b'], [30, 'c']]);
});

void test('toJSON() preserves duplicate key entries in order', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'first');
  tree.put(5, 'second');
  tree.put(3, 'lo');
  assert.deepEqual(tree.toJSON().entries, [[3, 'lo'], [5, 'first'], [5, 'second']]);
});

void test('toJSON() output is JSON.stringify-able', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  const parsed = JSON.parse(JSON.stringify(tree.toJSON())) as BTreeJSON<number, string>;
  assert.deepEqual(parsed.entries, [[1, 'a'], [2, 'b']]);
  assert.equal(parsed.version, 1);
});

// ===========================================================================
// fromJSON()
// ===========================================================================

void test('fromJSON() reconstructs an empty tree', (): void => {
  const restored = InMemoryBTree.fromJSON(numTree().toJSON(), compareNumbers);
  assert.equal(restored.size(), 0);
  restored.assertInvariants();
});

void test('fromJSON() reconstructs entries in correct order', (): void => {
  const tree = numTree();
  tree.put(30, 'c');
  tree.put(10, 'a');
  tree.put(20, 'b');

  const snap = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers).snapshot();
  assert.equal(snap[0].key, 10);
  assert.equal(snap[1].key, 20);
  assert.equal(snap[2].key, 30);
});

void test('fromJSON() preserves duplicate keys allow policy', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'first');
  tree.put(5, 'second');

  const snap = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers).snapshot();
  assert.equal(snap[0].value, 'first');
  assert.equal(snap[1].value, 'second');
});

void test('fromJSON() preserves reject policy', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  tree.put(1, 'a');

  const restored = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers);
  assert.throws(
    () => restored.put(1, 'dup'),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
});

void test('fromJSON() preserves enableEntryIdLookup', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });
  tree.put(1, 'a');

  const restored = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers);
  const found = restored.peekById(restored.snapshot()[0].entryId);
  assert.notEqual(found, null);
  assert.equal(found!.key, 1);
});

void test('fromJSON() preserves current autoScale capacities after high-water growth', (): void => {
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
  const restored = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers);
  const afterConfig = restored.toJSON().config;

  assert.equal(beforeConfig.maxLeafEntries, 256);
  assert.equal(beforeConfig.maxBranchChildren, 128);
  assert.equal(afterConfig.maxLeafEntries, beforeConfig.maxLeafEntries);
  assert.equal(afterConfig.maxBranchChildren, beforeConfig.maxBranchChildren);
  assert.equal(restored.size(), tree.size());
  restored.assertInvariants();
});

// ===========================================================================
// Round-trip
// ===========================================================================

void test('round-trip: toJSON -> JSON.stringify -> JSON.parse -> fromJSON', (): void => {
  const tree = numTree();
  tree.put(10, 'a');
  tree.put(20, 'b');
  tree.put(5, 'c');

  const restored = InMemoryBTree.fromJSON(
    JSON.parse(JSON.stringify(tree.toJSON())) as BTreeJSON<number, string>,
    compareNumbers,
  );
  assert.equal(restored.size(), 3);
  assert.equal(restored.get(5), 'c');
  restored.assertInvariants();
});

void test('round-trip: autoScale tree via toJSON -> fromJSON preserves tier and data', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: compareNumbers,
    autoScale: true,
  });
  for (let i = 0; i < 1100; i += 1) {
    tree.put(i, `v${i}`);
  }

  const json = tree.toJSON();
  assert.equal(json.config.autoScale, true);
  assert.equal(json.config.maxLeafEntries, 64); // tier 1

  const restored = InMemoryBTree.fromJSON(json, compareNumbers);
  assert.equal(restored.size(), 1100);
  assert.equal(restored.get(0), 'v0');
  assert.equal(restored.get(1099), 'v1099');
  restored.assertInvariants();

  // Verify restored config matches
  const restoredJSON = restored.toJSON();
  assert.equal(restoredJSON.config.autoScale, true);
  assert.equal(restoredJSON.config.maxLeafEntries, json.config.maxLeafEntries);
  assert.equal(restoredJSON.config.maxBranchChildren, json.config.maxBranchChildren);

  // Verify restored tree can still grow
  for (let i = 1100; i < 1200; i += 1) {
    restored.put(i, `new-${i}`);
  }
  assert.equal(restored.size(), 1200);
  restored.assertInvariants();
});

void test('fromJSON rejects unsorted entries with duplicateKeys allow', (): void => {
  const json: BTreeJSON<number, string> = {
    version: 1,
    config: { maxLeafEntries: 64, maxBranchChildren: 64, duplicateKeys: 'allow', enableEntryIdLookup: false, autoScale: false },
    entries: [[20, 'b'], [10, 'a']],
  };
  assert.throws(
    () => InMemoryBTree.fromJSON(json, (a, b) => a - b),
    BTreeValidationError,
  );
});

void test('fromJSON accepts equal keys when duplicateKeys is allow', (): void => {
  const json: BTreeJSON<number, string> = {
    version: 1,
    config: { maxLeafEntries: 64, maxBranchChildren: 64, duplicateKeys: 'allow', enableEntryIdLookup: false, autoScale: false },
    entries: [[10, 'a'], [10, 'b'], [20, 'c']],
  };
  const restored = InMemoryBTree.fromJSON(json, (a, b) => a - b);
  assert.equal(restored.size(), 3);
  restored.assertInvariants();
});

void test('fromJSON rejects unsorted entries', (): void => {
  const json: BTreeJSON<number, string> = {
    version: 1,
    config: { maxLeafEntries: 64, maxBranchChildren: 64, duplicateKeys: 'replace', enableEntryIdLookup: false, autoScale: false },
    entries: [[20, 'b'], [10, 'a']],
  };
  assert.throws(
    () => InMemoryBTree.fromJSON(json, (a, b) => a - b),
    BTreeValidationError,
  );
});

void test('fromJSON rejects duplicate keys when policy is reject', (): void => {
  const json: BTreeJSON<number, string> = {
    version: 1,
    config: { maxLeafEntries: 64, maxBranchChildren: 64, duplicateKeys: 'reject', enableEntryIdLookup: false, autoScale: false },
    entries: [[10, 'a'], [10, 'b']],
  };
  assert.throws(
    () => InMemoryBTree.fromJSON(json, (a, b) => a - b),
    BTreeValidationError,
  );
});

void test('round-trip with many entries and independent mutability', (): void => {
  const tree = numTree();
  for (let i = 0; i < 30; i++) tree.put(i * 3, `val-${i}`);

  const restored = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers);
  const origSnap = tree.snapshot();
  const restoredSnap = restored.snapshot();
  for (let i = 0; i < origSnap.length; i++) {
    assert.equal(restoredSnap[i].key, origSnap[i].key);
    assert.equal(restoredSnap[i].value, origSnap[i].value);
  }

  restored.put(999, 'new');
  assert.equal(tree.get(999), null);
  restored.assertInvariants();
  tree.assertInvariants();
});

void test('round-trip preserves falsy keys and values (0, empty string)', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: compareNumbers,
  });
  tree.put(0, '');
  tree.put(1, 'non-empty');

  const restored = InMemoryBTree.fromJSON(tree.toJSON(), compareNumbers);
  assert.equal(restored.size(), 2);
  assert.equal(restored.get(0), '');
  assert.equal(restored.get(1), 'non-empty');
  restored.assertInvariants();
});

