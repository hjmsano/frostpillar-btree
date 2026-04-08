import assert from 'node:assert/strict';
import test from 'node:test';

import { BTreeValidationError, InMemoryBTree } from '../src/index.js';
import type { BTreeState } from '../src/btree/types.js';

interface InternalTree<TKey, TValue> {
  state: BTreeState<TKey, TValue>;
}

const accessState = <TKey, TValue>(
  tree: InMemoryBTree<TKey, TValue>,
): BTreeState<TKey, TValue> =>
  (tree as unknown as InternalTree<TKey, TValue>).state;

void test('putMany throws when baseSequence + entries.length > MAX_SAFE_INTEGER', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = accessState(tree);
  state.nextSequence = Number.MAX_SAFE_INTEGER - 2;

  assert.throws(
    () =>
      tree.putMany([
        { key: 1, value: 'a' },
        { key: 2, value: 'b' },
        { key: 3, value: 'c' },
      ]),
    (error: Error): boolean =>
      error instanceof BTreeValidationError &&
      error.message.includes('overflow'),
  );
});

void test('putMany succeeds when baseSequence + entries.length === MAX_SAFE_INTEGER', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = accessState(tree);
  state.nextSequence = Number.MAX_SAFE_INTEGER - 3;

  const ids = tree.putMany([
    { key: 1, value: 'a' },
    { key: 2, value: 'b' },
    { key: 3, value: 'c' },
  ]);

  assert.equal(ids.length, 3);
  assert.equal(tree.size(), 3);
});

void test('putMany on non-empty tree falls back to sequential insert', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  tree.put(1, 'a');

  const ids = tree.putMany([
    { key: 2, value: 'b' },
    { key: 3, value: 'c' },
  ]);
  assert.equal(ids.length, 2);
  assert.equal(tree.size(), 3);
});

void test('clear preserves nextSequence so putMany continues from previous value', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  tree.put(1, 'a');
  const sequenceBefore = accessState(tree).nextSequence;
  tree.clear();

  const state = accessState(tree);
  assert.equal(state.nextSequence, sequenceBefore);

  const ids = tree.putMany([
    { key: 10, value: 'x' },
    { key: 20, value: 'y' },
  ]);

  assert.equal(ids.length, 2);
  assert.equal(tree.size(), 2);
});

void test('single insert after bulk load near MAX_SAFE_INTEGER throws overflow', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = accessState(tree);
  state.nextSequence = Number.MAX_SAFE_INTEGER - 1;

  tree.putMany([{ key: 1, value: 'a' }]);

  assert.throws(
    () => tree.put(2, 'b'),
    (error: Error): boolean =>
      error instanceof BTreeValidationError &&
      error.message.includes('overflow'),
  );
});
