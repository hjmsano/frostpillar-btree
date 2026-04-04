import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeValidationError,
  InMemoryBTree,
} from '../src/index.js';

// --- duplicateKeys policy tests ---

void test('duplicateKeys defaults to replace: second insert overwrites', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  const idA = tree.put(5, 'a');
  const idB = tree.put(5, 'b');

  assert.equal(idB, idA);
  assert.deepEqual(tree.range(5, 5), [
    { entryId: idA, key: 5, value: 'b' },
  ]);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('duplicateKeys allow: explicit config enables duplicate keys', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'allow',
  });

  const idA = tree.put(5, 'a');
  const idB = tree.put(5, 'b');

  assert.deepEqual(tree.range(5, 5), [
    { entryId: idA, key: 5, value: 'a' },
    { entryId: idB, key: 5, value: 'b' },
  ]);
  assert.equal(tree.size(), 2);
  tree.assertInvariants();
});

void test('duplicateKeys reject: throws on duplicate key insert', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'reject',
  });

  tree.put(5, 'a');
  assert.throws(
    (): void => { tree.put(5, 'b'); },
    BTreeValidationError,
  );
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('duplicateKeys reject: allows different keys', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'reject',
  });

  const id5 = tree.put(5, 'five');
  const id10 = tree.put(10, 'ten');
  const id3 = tree.put(3, 'three');

  assert.deepEqual(tree.snapshot(), [
    { entryId: id3, key: 3, value: 'three' },
    { entryId: id5, key: 5, value: 'five' },
    { entryId: id10, key: 10, value: 'ten' },
  ]);
  assert.equal(tree.size(), 3);
  tree.assertInvariants();
});

void test('duplicateKeys reject: allows re-insert after remove', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'reject',
  });

  tree.put(5, 'a');
  tree.remove(5);
  const idNew = tree.put(5, 'b');

  assert.deepEqual(tree.snapshot(), [
    { entryId: idNew, key: 5, value: 'b' },
  ]);
  tree.assertInvariants();
});

void test('duplicateKeys replace: overwrites value and preserves original EntryId', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
  });

  const idOriginal = tree.put(5, 'a');
  const idReturned = tree.put(5, 'b');

  assert.equal(idReturned, idOriginal);
  assert.deepEqual(tree.snapshot(), [
    { entryId: idOriginal, key: 5, value: 'b' },
  ]);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('duplicateKeys replace: multiple replacements on same key', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
    enableEntryIdLookup: true,
  });

  const idOriginal = tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');

  assert.deepEqual(tree.peekById(idOriginal), { entryId: idOriginal, key: 5, value: 'c' });
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});

void test('duplicateKeys replace: different keys insert normally', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
  });

  const id5 = tree.put(5, 'five');
  const id10 = tree.put(10, 'ten');
  const id3 = tree.put(3, 'three');

  assert.deepEqual(tree.snapshot(), [
    { entryId: id3, key: 3, value: 'three' },
    { entryId: id5, key: 5, value: 'five' },
    { entryId: id10, key: 10, value: 'ten' },
  ]);
  assert.equal(tree.size(), 3);
  tree.assertInvariants();
});

void test('duplicateKeys replace: works correctly with splits', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  const ids = new Map<number, number>();
  for (let i = 0; i < 20; i += 1) {
    ids.set(i, tree.put(i, i * 10));
  }
  tree.assertInvariants();

  for (let i = 0; i < 20; i += 1) {
    const returnedId = tree.put(i, i * 100);
    assert.equal(returnedId, ids.get(i));
  }

  assert.equal(tree.size(), 20);
  const snapshot = tree.snapshot();
  for (let i = 0; i < 20; i += 1) {
    assert.equal(snapshot[i].value, i * 100);
    assert.equal(snapshot[i].entryId, ids.get(i));
  }
  tree.assertInvariants();
});

void test('duplicateKeys reject: assertInvariants detects no duplicates', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'reject',
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `v${String(i)}`);
  }
  tree.assertInvariants();
});

void test('duplicateKeys allow: insertion order preserved across leaf splits', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  // Insert 20 entries with key=5, forcing multiple leaf splits
  const expectedOrder: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    tree.put(5, `v${i}`);
    expectedOrder.push(`v${i}`);
  }

  tree.assertInvariants();

  // Verify range(5,5) returns all entries in insertion order
  const result = tree.range(5, 5);
  assert.equal(result.length, 20);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(result[i].value, expectedOrder[i], `entry ${i} should preserve insertion order`);
  }

  // Also verify entries() iterator gives same order
  const allEntries = [...tree.entries()];
  assert.equal(allEntries.length, 20);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(allEntries[i].value, expectedOrder[i]);
  }
});

void test('duplicateKeys replace: assertInvariants detects no duplicates', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    duplicateKeys: 'replace',
    maxLeafEntries: 3,
    maxBranchChildren: 3,
  });

  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `v${String(i)}`);
  }
  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `updated-${String(i)}`);
  }
  tree.assertInvariants();
});
