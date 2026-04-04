import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryBTree,
  type BTreeEntry,
} from '../src/index.js';

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

// ---------------------------------------------------------------------------
// entries()
// ---------------------------------------------------------------------------

void test('entries() returns empty iterator for empty tree', (): void => {
  const tree = numTree();
  const result = [...tree.entries()];
  assert.deepEqual(result, []);
});

void test('entries() returns all entries in ascending comparator order', (): void => {
  const tree = numTree();
  const id10 = tree.put(10, 'v10');
  const id5 = tree.put(5, 'v5');
  const id20 = tree.put(20, 'v20');

  assert.deepEqual([...tree.entries()], [
    { entryId: id5, key: 5, value: 'v5' },
    { entryId: id10, key: 10, value: 'v10' },
    { entryId: id20, key: 20, value: 'v20' },
  ]);
  tree.assertInvariants();
});

void test('entries() preserves insertion order for duplicate keys', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  const idA = tree.put(7, 'a');
  const idB = tree.put(7, 'b');
  const idC = tree.put(7, 'c');

  assert.deepEqual([...tree.entries()], [
    { entryId: idA, key: 7, value: 'a' },
    { entryId: idB, key: 7, value: 'b' },
    { entryId: idC, key: 7, value: 'c' },
  ]);
  tree.assertInvariants();
});

void test('entries() traverses across multiple leaf boundaries', (): void => {
  const tree = numTree();
  const expected: BTreeEntry<number, string>[] = [];
  for (let i = 0; i < 30; i += 1) {
    const id = tree.put(i, `v${String(i)}`);
    expected.push({ entryId: id, key: i, value: `v${String(i)}` });
  }

  assert.deepEqual([...tree.entries()], expected);
  tree.assertInvariants();
});

void test('entries() matches snapshot() output', (): void => {
  const tree = numTree();
  tree.put(30, 'v30');
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.deepEqual([...tree.entries()], tree.snapshot());
});

// ---------------------------------------------------------------------------
// keys()
// ---------------------------------------------------------------------------

void test('keys() returns empty iterator for empty tree', (): void => {
  const tree = numTree();
  assert.deepEqual([...tree.keys()], []);
});

void test('keys() returns all keys in ascending comparator order', (): void => {
  const tree = numTree();
  tree.put(30, 'v30');
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.deepEqual([...tree.keys()], [10, 20, 30]);
  tree.assertInvariants();
});

void test('keys() includes duplicate keys in insertion order', (): void => {
  const tree = numTree({ duplicateKeys: 'allow' });
  tree.put(5, 'a');
  tree.put(5, 'b');
  tree.put(5, 'c');

  assert.deepEqual([...tree.keys()], [5, 5, 5]);
});

// ---------------------------------------------------------------------------
// values()
// ---------------------------------------------------------------------------

void test('values() returns empty iterator for empty tree', (): void => {
  const tree = numTree();
  assert.deepEqual([...tree.values()], []);
});

void test('values() returns all values in ascending key order', (): void => {
  const tree = numTree();
  tree.put(30, 'v30');
  tree.put(10, 'v10');
  tree.put(20, 'v20');

  assert.deepEqual([...tree.values()], ['v10', 'v20', 'v30']);
  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Symbol.iterator
// ---------------------------------------------------------------------------

void test('[Symbol.iterator] works with for...of', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');

  const collected: BTreeEntry<number, string>[] = [];
  for (const entry of tree) {
    collected.push(entry);
  }

  assert.deepEqual(collected, [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
  ]);
});

void test('[Symbol.iterator] works with spread operator', (): void => {
  const tree = numTree();
  const id1 = tree.put(1, 'a');
  const id2 = tree.put(2, 'b');

  assert.deepEqual([...tree], [
    { entryId: id1, key: 1, value: 'a' },
    { entryId: id2, key: 2, value: 'b' },
  ]);
});

void test('[Symbol.iterator] works with Array.from', (): void => {
  const tree = numTree();
  tree.put(3, 'c');
  tree.put(1, 'a');

  const arr = Array.from(tree);
  assert.equal(arr.length, 2);
  assert.equal(arr[0].key, 1);
  assert.equal(arr[1].key, 3);
});

void test('[Symbol.iterator] returns same results as entries()', (): void => {
  const tree = numTree();
  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  assert.deepEqual([...tree], [...tree.entries()]);
});

// ---------------------------------------------------------------------------
// forEach()
// ---------------------------------------------------------------------------

void test('forEach does not call callback for empty tree', (): void => {
  const tree = numTree();
  let called = false;
  tree.forEach((): void => {
    called = true;
  });
  assert.equal(called, false);
});

void test('forEach visits entries in ascending comparator order', (): void => {
  const tree = numTree();
  const id10 = tree.put(10, 'v10');
  const id5 = tree.put(5, 'v5');
  const id20 = tree.put(20, 'v20');

  const visited: BTreeEntry<number, string>[] = [];
  tree.forEach((entry: BTreeEntry<number, string>): void => {
    visited.push(entry);
  });

  assert.deepEqual(visited, [
    { entryId: id5, key: 5, value: 'v5' },
    { entryId: id10, key: 10, value: 'v10' },
    { entryId: id20, key: 20, value: 'v20' },
  ]);
  tree.assertInvariants();
});

void test('forEach respects thisArg', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  const collector = {
    items: [] as number[],
    collect(entry: BTreeEntry<number, string>): void {
      this.items.push(entry.key);
    },
  };

  tree.forEach(function (this: typeof collector, entry: BTreeEntry<number, string>): void {
    this.collect(entry);
  }, collector);

  assert.deepEqual(collector.items, [1, 2]);
});

void test('forEach matches entries() order', (): void => {
  const tree = numTree();
  for (let i = 0; i < 15; i += 1) {
    tree.put(i, `v${String(i)}`);
  }

  const fromForEach: BTreeEntry<number, string>[] = [];
  tree.forEach((entry: BTreeEntry<number, string>): void => {
    fromForEach.push(entry);
  });

  assert.deepEqual(fromForEach, [...tree.entries()]);
});

// ---------------------------------------------------------------------------
// Iterator protocol: exhaustion
// ---------------------------------------------------------------------------

void test('iterator next() returns done after exhaustion', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  const iter = tree.entries();
  const first = iter.next();
  assert.equal(first.done, false);
  assert.equal(first.value.key, 1);

  const second = iter.next();
  assert.equal(second.done, true);
  assert.equal(second.value, undefined);

  // Repeated calls after exhaustion must consistently return done
  for (let i = 0; i < 5; i += 1) {
    const extra = iter.next();
    assert.equal(extra.done, true);
    assert.equal(extra.value, undefined);
  }
});

void test('keys() iterator exhausts correctly', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  const iter = tree.keys();
  assert.deepEqual(iter.next(), { value: 1, done: false });
  assert.deepEqual(iter.next(), { value: undefined, done: true });
});

void test('values() iterator exhausts correctly', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  const iter = tree.values();
  assert.deepEqual(iter.next(), { value: 'a', done: false });
  assert.deepEqual(iter.next(), { value: undefined, done: true });
});

// ---------------------------------------------------------------------------
// Iterators are iterable (Symbol.iterator on iterators themselves)
// ---------------------------------------------------------------------------

void test('entries() iterator is itself iterable', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  const iter = tree.entries();
  const collected: BTreeEntry<number, string>[] = [];
  for (const entry of iter) {
    collected.push(entry);
  }
  assert.equal(collected.length, 2);
});

void test('keys() iterator is itself iterable', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  const iter = tree.keys();
  const collected: number[] = [];
  for (const key of iter) {
    collected.push(key);
  }
  assert.deepEqual(collected, [1, 2]);
});

void test('values() iterator is itself iterable', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');

  const iter = tree.values();
  const collected: string[] = [];
  for (const value of iter) {
    collected.push(value);
  }
  assert.deepEqual(collected, ['a', 'b']);
});

void test('forEach exception in callback does not corrupt tree', (): void => {
  const tree = numTree();
  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  assert.throws(() => {
    tree.forEach((entry: BTreeEntry<number, string>): void => {
      if (entry.key === 2) throw new Error('stop');
    });
  }, { message: 'stop' });

  // Tree remains valid after callback exception
  assert.equal(tree.size(), 3);
  assert.deepEqual([...tree.keys()], [1, 2, 3]);
  tree.assertInvariants();
});

void test('entriesReversed() repeated next() after exhaustion is stable', (): void => {
  const tree = numTree();
  tree.put(1, 'a');

  const iter = tree.entriesReversed();
  iter.next(); // consume single entry
  // Repeated calls after exhaustion
  for (let i = 0; i < 5; i += 1) {
    const extra = iter.next();
    assert.equal(extra.done, true);
    assert.equal(extra.value, undefined);
  }
});
