import assert from 'node:assert/strict';
import test from 'node:test';

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
  autoScale?: boolean;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ---------------------------------------------------------------------------
// putMany — empty input
// ---------------------------------------------------------------------------

void test('putMany with empty array is a no-op', (): void => {
  const tree = numTree();
  tree.put(5, 'v5');
  assert.deepEqual(tree.putMany([]), []);
  assert.equal(tree.size(), 1);
  const empty = numTree();
  assert.deepEqual(empty.putMany([]), []);
  assert.equal(empty.size(), 0);
});

// ---------------------------------------------------------------------------
// putMany — basic sorted insert on empty tree
// ---------------------------------------------------------------------------

void test('putMany on empty tree builds correct sorted structure', (): void => {
  const tree = numTree();
  const entries = [
    { key: 1, value: 'a' },
    { key: 2, value: 'b' },
    { key: 3, value: 'c' },
    { key: 4, value: 'd' },
    { key: 5, value: 'e' },
  ];

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 5);
  assert.equal(tree.size(), 5);
  const snap = tree.snapshot();
  assert.equal(snap.length, 5);
  assert.equal(snap[0].key, 1);
  assert.equal(snap[0].value, 'a');
  assert.equal(snap[4].key, 5);
  assert.equal(snap[4].value, 'e');
  tree.assertInvariants();
});

void test('putMany on empty tree with single entry', (): void => {
  const tree = numTree();

  const ids = tree.putMany([{ key: 42, value: 'x' }]);

  assert.equal(ids.length, 1);
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(42), 'x');
  tree.assertInvariants();
});

void test('putMany on empty tree with many entries triggers splits', (): void => {
  const tree = numTree();
  const entries = Array.from({ length: 30 }, (_, i) => ({
    key: i * 10,
    value: `v${String(i)}`,
  }));

  const ids = tree.putMany(entries);

  assert.equal(ids.length, 30);
  assert.equal(tree.size(), 30);
  for (let i = 0; i < 30; i += 1) {
    assert.equal(tree.get(i * 10), `v${String(i)}`);
  }
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — non-empty tree
// ---------------------------------------------------------------------------

void test('putMany on non-empty tree inserts sequentially', (): void => {
  const tree = numTree();
  tree.put(1, 'existing1');
  tree.put(5, 'existing5');

  const ids = tree.putMany([
    { key: 2, value: 'a' },
    { key: 3, value: 'b' },
    { key: 4, value: 'c' },
  ]);

  assert.equal(ids.length, 3);
  assert.equal(tree.size(), 5);
  assert.equal(tree.get(2), 'a');
  assert.equal(tree.get(3), 'b');
  assert.equal(tree.get(4), 'c');
  tree.assertInvariants();
});

void test('putMany on non-empty tree with many entries', (): void => {
  const tree = numTree();
  for (let i = 0; i < 10; i += 1) {
    tree.put(i * 100, `old${String(i)}`);
  }

  const newEntries = Array.from({ length: 20 }, (_, i) => ({
    key: i * 5 + 1,
    value: `new${String(i)}`,
  }));

  const ids = tree.putMany(newEntries);

  assert.equal(ids.length, 20);
  assert.equal(tree.size(), 30);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — sort order validation
// ---------------------------------------------------------------------------

void test('putMany throws on unsorted input', (): void => {
  const tree = numTree();

  assert.throws(
    () => tree.putMany([
      { key: 3, value: 'a' },
      { key: 1, value: 'b' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: entries not in ascending order.',
  );
  assert.equal(tree.size(), 0);
});

void test('putMany throws on unsorted input (equal keys with reject policy)', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });

  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 1, value: 'b' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: duplicate key rejected.',
  );
  assert.equal(tree.size(), 0);
});

void test('putMany throws on unsorted input (equal keys with replace policy)', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });

  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 1, value: 'b' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: equal keys not allowed in strict mode.',
  );
  assert.equal(tree.size(), 0);
});

// ---------------------------------------------------------------------------
// putMany — distinct validation error messages
// ---------------------------------------------------------------------------

void test('putMany sort-order violation gives "entries not in ascending order" message', (): void => {
  const tree = numTree();
  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 2, value: 'b' },
      { key: 1, value: 'c' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: entries not in ascending order.',
  );
});

void test('putMany duplicate-key rejection gives "duplicate key rejected" message', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 1, value: 'b' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: duplicate key rejected.',
  );
});

void test('putMany equal-keys with replace policy gives "equal keys not allowed in strict mode" message', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });
  assert.throws(
    () => tree.putMany([
      { key: 5, value: 'x' },
      { key: 5, value: 'y' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: equal keys not allowed in strict mode.',
  );
});

void test('putMany allows equal keys with allow policy', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });

  const ids = tree.putMany([
    { key: 1, value: 'a' },
    { key: 1, value: 'b' },
    { key: 1, value: 'c' },
  ]);

  assert.equal(ids.length, 3);
  assert.equal(tree.size(), 3);
  const snap = tree.snapshot();
  assert.equal(snap[0].value, 'a');
  assert.equal(snap[1].value, 'b');
  assert.equal(snap[2].value, 'c');
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — duplicate key policies
// ---------------------------------------------------------------------------

void test('putMany with replace policy replaces existing keys', (): void => {
  const tree = numTree({ duplicateKeys: 'replace' });
  tree.put(2, 'old2');
  tree.put(4, 'old4');

  const ids = tree.putMany([
    { key: 1, value: 'a' },
    { key: 2, value: 'new2' },
    { key: 3, value: 'c' },
    { key: 4, value: 'new4' },
    { key: 5, value: 'e' },
  ]);

  assert.equal(ids.length, 5);
  assert.equal(tree.size(), 5);
  assert.equal(tree.get(2), 'new2');
  assert.equal(tree.get(4), 'new4');
  tree.assertInvariants();
});

void test('putMany with reject policy throws on existing key', (): void => {
  const tree = numTree({ duplicateKeys: 'reject' });
  tree.put(3, 'old3');

  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 2, value: 'b' },
      { key: 3, value: 'c' },
    ]),
    (err: unknown) => err instanceof Error && err.message.includes('Duplicate'),
  );
});

void test('putMany with allow policy on empty tree preserves insertion order', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });

  const ids = tree.putMany([
    { key: 5, value: 'a' },
    { key: 5, value: 'b' },
    { key: 10, value: 'c' },
    { key: 10, value: 'd' },
  ]);

  assert.equal(ids.length, 4);
  assert.equal(tree.size(), 4);
  const snap = tree.snapshot();
  assert.equal(snap[0].value, 'a');
  assert.equal(snap[1].value, 'b');
  assert.equal(snap[2].value, 'c');
  assert.equal(snap[3].value, 'd');
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — entryId correctness
// ---------------------------------------------------------------------------

void test('putMany returns valid EntryIds', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });

  const ids = tree.putMany([
    { key: 10, value: 'a' },
    { key: 20, value: 'b' },
    { key: 30, value: 'c' },
  ]);

  assert.equal(ids.length, 3);
  for (let i = 0; i < ids.length; i += 1) {
    const entry = tree.peekById(ids[i]);
    assert.notEqual(entry, null);
    assert.equal(entry!.key, (i + 1) * 10);
  }
  tree.assertInvariants();
});

void test('putMany EntryIds are distinct', (): void => {
  const tree = numTree();

  const ids = tree.putMany([
    { key: 1, value: 'a' },
    { key: 2, value: 'b' },
    { key: 3, value: 'c' },
  ]);

  const unique = new Set<EntryId>(ids);
  assert.equal(unique.size, 3);
});

// ---------------------------------------------------------------------------
// putMany — enableEntryIdLookup
// ---------------------------------------------------------------------------

void test('putMany populates entryKeys map when enableEntryIdLookup is true', (): void => {
  const tree = numTree({ enableEntryIdLookup: true });

  const ids = tree.putMany([
    { key: 100, value: 'a' },
    { key: 200, value: 'b' },
  ]);

  assert.deepEqual(tree.peekById(ids[0]), { entryId: ids[0], key: 100, value: 'a' });
  assert.deepEqual(tree.peekById(ids[1]), { entryId: ids[1], key: 200, value: 'b' });
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// putMany — error recovery: tree usable after failed putMany
// ---------------------------------------------------------------------------

void test('tree is valid and usable after putMany rejects unsorted input', (): void => {
  const tree = numTree();
  tree.put(10, 'existing');

  assert.throws(
    () => tree.putMany([
      { key: 5, value: 'a' },
      { key: 3, value: 'b' },
    ]),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'putMany: entries not in ascending order.',
  );

  // Tree should still be valid
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(10), 'existing');
  tree.assertInvariants();

  // Tree should accept new inserts
  tree.put(20, 'new');
  assert.equal(tree.size(), 2);
  assert.equal(tree.get(20), 'new');
  tree.assertInvariants();
});

void test('tree is valid after putMany rejects duplicate with reject policy', (): void => {
  const tree = numTree({ duplicateKeys: 'reject', enableEntryIdLookup: true });
  const existingId = tree.put(3, 'old3');

  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 2, value: 'b' },
      { key: 3, value: 'c' },
    ]),
    (err: unknown) => err instanceof Error && err.message.includes('Duplicate'),
  );

  // putMany is non-atomic on non-empty trees: keys 1 and 2 were committed
  // before the duplicate at key 3 threw. Assert the partial state explicitly.
  assert.equal(tree.size(), 3);
  assert.equal(tree.get(1), 'a');
  assert.equal(tree.get(2), 'b');

  // Existing entry still accessible via entryId
  assert.deepEqual(tree.peekById(existingId), { entryId: existingId, key: 3, value: 'old3' });
  tree.assertInvariants();

  // Tree accepts new unique insertions
  tree.put(99, 'ok');
  assert.equal(tree.get(99), 'ok');
  tree.assertInvariants();
});
