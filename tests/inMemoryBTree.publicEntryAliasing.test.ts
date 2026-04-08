/**
 * Tests that public API methods return shallow copies of internal LeafEntry
 * objects, not live aliases. A subsequent mutation via updateById must NOT
 * be visible through a previously returned entry reference.
 *
 * See: B-3 — Fix silent aliasing of internal LeafEntry objects
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';

const makeTree = (): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    enableEntryIdLookup: true,
    maxLeafEntries: 4,
    maxBranchChildren: 4,
  });

void test('findFirst: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(42, 'old');
  const entry = tree.findFirst(42);
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(entry.value, 'old', 'findFirst must not alias internal entry');
});

void test('findLast: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(42, 'old');
  const entry = tree.findLast(42);
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(entry.value, 'old', 'findLast must not alias internal entry');
});

void test('getPairOrNextLower: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(42, 'old');
  const entry = tree.getPairOrNextLower(42);
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(
    entry.value,
    'old',
    'getPairOrNextLower must not alias internal entry',
  );
});

void test('peekFirst: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'old');
  tree.put(2, 'other');
  const entry = tree.peekFirst();
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(entry.value, 'old', 'peekFirst must not alias internal entry');
});

void test('peekLast: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  tree.put(1, 'other');
  const id = tree.put(2, 'old');
  const entry = tree.peekLast();
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(entry.value, 'old', 'peekLast must not alias internal entry');
});

void test('peekById: returned entry is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(42, 'old');
  const entry = tree.peekById(id);
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.updateById(id, 'new');
  assert.equal(entry.value, 'old', 'peekById must not alias internal entry');
});

void test('updateById: returned entry reflects new value and is not a live alias', (): void => {
  const tree = makeTree();
  const id = tree.put(42, 'old');
  const entry = tree.updateById(id, 'new');
  assert.ok(entry !== null);
  assert.equal(entry.value, 'new');
  tree.updateById(id, 'newer');
  assert.equal(entry.value, 'new', 'updateById must not alias internal entry');
});

void test('entries(): yielded entries are not live aliases', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'old');
  tree.put(2, 'other');
  const collected = [...tree.entries()];
  assert.equal(collected.length, 2);
  assert.equal(collected[0].value, 'old');
  tree.updateById(id, 'new');
  assert.equal(
    collected[0].value,
    'old',
    'entries() must not yield live aliases',
  );
});

void test('entriesReversed(): yielded entries are not live aliases', (): void => {
  const tree = makeTree();
  tree.put(1, 'other');
  const id = tree.put(2, 'old');
  const collected = [...tree.entriesReversed()];
  assert.equal(collected.length, 2);
  assert.equal(collected[0].value, 'old');
  tree.updateById(id, 'new');
  assert.equal(
    collected[0].value,
    'old',
    'entriesReversed() must not yield live aliases',
  );
});

void test('forEach: callback receives entries that are not live aliases', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'old');
  tree.put(2, 'other');
  const collected: { value: string }[] = [];
  tree.forEach((e) => collected.push(e));
  assert.equal(collected[0].value, 'old');
  tree.updateById(id, 'new');
  assert.equal(collected[0].value, 'old', 'forEach must not pass live aliases');
});

void test('snapshot(): array elements are not live aliases', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'old');
  tree.put(2, 'other');
  const snap = tree.snapshot();
  assert.equal(snap.length, 2);
  assert.equal(snap[0].value, 'old');
  tree.updateById(id, 'new');
  assert.equal(
    snap[0].value,
    'old',
    'snapshot() must not contain live aliases',
  );
});

void test('range(): returned entries are not live aliases', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'old');
  tree.put(5, 'other');
  const results = tree.range(1, 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].value, 'old');
  tree.updateById(id, 'new');
  assert.equal(
    results[0].value,
    'old',
    'range() must not contain live aliases',
  );
});

void test('put-replace: previously returned entry is not aliased', (): void => {
  const tree = makeTree();
  tree.put(42, 'old');
  const entry = tree.findFirst(42);
  assert.ok(entry !== null);
  assert.equal(entry.value, 'old');
  tree.put(42, 'new');
  assert.equal(entry.value, 'old', 'put-replace must not alias internal entry');
});

void test('put-replace: entries() snapshot is not aliased', (): void => {
  const tree = makeTree();
  tree.put(1, 'old');
  tree.put(2, 'other');
  const collected = [...tree.entries()];
  assert.equal(collected[0].value, 'old');
  tree.put(1, 'new');
  assert.equal(
    collected[0].value,
    'old',
    'put-replace must not alias entries from entries()',
  );
});

void test('put-replace: forEach snapshot is not aliased', (): void => {
  const tree = makeTree();
  tree.put(1, 'old');
  tree.put(2, 'other');
  const collected: { value: string }[] = [];
  tree.forEach((e) => collected.push(e));
  assert.equal(collected[0].value, 'old');
  tree.put(1, 'new');
  assert.equal(
    collected[0].value,
    'old',
    'put-replace must not alias entries from forEach',
  );
});

void test('external mutation of entries() result cannot corrupt tree', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  const first = [...tree.entries()][0];
  assert.throws(
    () => {
      (first as { key: number }).key = 999;
    },
    TypeError,
    'frozen entries must reject mutation',
  );
  assert.equal(tree.hasKey(1), true, 'tree key 1 must remain intact');
  assert.equal(tree.get(1), 'v1', 'tree value for key 1 must remain intact');
  tree.assertInvariants();
});

void test('external mutation of snapshot() result cannot corrupt tree', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  const snap = tree.snapshot();
  assert.throws(
    () => {
      (snap[0] as { value: string }).value = 'hacked';
    },
    TypeError,
    'frozen entries must reject mutation',
  );
  assert.equal(tree.get(1), 'v1', 'tree value must remain intact');
  tree.assertInvariants();
});

void test('external mutation of forEach() result cannot corrupt tree', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const collected: { entryId: number; key: number; value: string }[] = [];
  tree.forEach((e) =>
    collected.push(e as { entryId: number; key: number; value: string }),
  );
  assert.throws(
    () => {
      collected[0].entryId = 999 as never;
    },
    TypeError,
    'frozen entries must reject mutation',
  );
  tree.assertInvariants();
});
