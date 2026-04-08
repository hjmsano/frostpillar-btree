/**
 * Tests that all public API methods return frozen entry objects.
 * Callers MUST NOT be able to mutate properties of returned entries.
 *
 * Covers both toPublicEntry paths (single-entry reads, range) and
 * freezeEntry paths (bulk iteration: entries, snapshot, forEach).
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

// ===========================================================================
// toPublicEntry APIs must return frozen entries
// ===========================================================================

void test('external mutation of findFirst() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.findFirst(1);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'findFirst must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of findLast() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.findLast(1);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { key: number }).key = 999;
    },
    TypeError,
    'findLast must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of peekFirst() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.peekFirst();
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'peekFirst must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of peekLast() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.peekLast();
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'peekLast must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of peekById() result is rejected', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'v1');
  const entry = tree.peekById(id);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'peekById must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of getPairOrNextLower() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.getPairOrNextLower(1);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'getPairOrNextLower must return frozen entry',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of updateById() result is rejected', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'v1');
  const entry = tree.updateById(id, 'v2');
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'updateById must return frozen entry',
  );
  assert.equal(tree.get(1), 'v2', 'tree must remain intact');
  tree.assertInvariants();
});

void test('external mutation of remove() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.remove(1);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'remove must return frozen entry',
  );
});

void test('external mutation of removeById() result is rejected', (): void => {
  const tree = makeTree();
  const id = tree.put(1, 'v1');
  const entry = tree.removeById(id);
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'removeById must return frozen entry',
  );
});

void test('external mutation of popFirst() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.popFirst();
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'popFirst must return frozen entry',
  );
});

void test('external mutation of popLast() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  const entry = tree.popLast();
  assert.ok(entry !== null);
  assert.throws(
    () => {
      (entry as { value: string }).value = 'hacked';
    },
    TypeError,
    'popLast must return frozen entry',
  );
});

void test('external mutation of range() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');
  const results = tree.range(1, 2);
  assert.equal(results.length, 2);
  assert.throws(
    () => {
      (results[0] as { value: string }).value = 'hacked';
    },
    TypeError,
    'range must return frozen entries',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
  tree.assertInvariants();
});

// ===========================================================================
// Bulk iteration APIs (frozen via freezeEntry)
// ===========================================================================

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

void test('external mutation of forEachRange() result is rejected', (): void => {
  const tree = makeTree();
  tree.put(1, 'v1');
  tree.put(2, 'v2');

  const entries: { entryId: number; key: number; value: string }[] = [];
  tree.forEachRange(1, 2, (entry) => {
    entries.push(entry as { entryId: number; key: number; value: string });
  });

  assert.equal(entries.length, 2);
  assert.throws(
    () => {
      entries[0].value = 'hacked';
    },
    TypeError,
    'forEachRange entries must be frozen',
  );
  assert.equal(tree.get(1), 'v1', 'tree must remain intact');
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
