import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, BTreeValidationError } from '../src/index.js';
import type { BTreeState } from '../src/btree/types.js';

void test('insert throws BTreeValidationError when sequence reaches MAX_SAFE_INTEGER', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = (tree as unknown as { state: BTreeState<number, string> }).state;
  state.nextSequence = Number.MAX_SAFE_INTEGER;

  assert.throws(
    () => tree.put(1, 'a'),
    (error: Error) => error instanceof BTreeValidationError && error.message.includes('overflow'),
  );
});

void test('putMany via bulk load throws when sequence would overflow', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = (tree as unknown as { state: BTreeState<number, string> }).state;
  state.nextSequence = Number.MAX_SAFE_INTEGER - 1;

  assert.throws(
    () => tree.putMany([
      { key: 1, value: 'a' },
      { key: 2, value: 'b' },
      { key: 3, value: 'c' },
    ]),
    (error: Error) => error instanceof BTreeValidationError && error.message.includes('overflow'),
  );
});

void test('insert succeeds at MAX_SAFE_INTEGER - 1', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
  });

  const state = (tree as unknown as { state: BTreeState<number, string> }).state;
  state.nextSequence = Number.MAX_SAFE_INTEGER - 1;

  const id = tree.put(1, 'a');
  assert.equal(typeof id, 'number');
});

void test('updateById does not allocate a new sequence — safe near MAX_SAFE_INTEGER', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    enableEntryIdLookup: true,
  });

  const id = tree.put(1, 'a');
  const state = (tree as unknown as { state: BTreeState<number, string> }).state;

  // Set sequence near overflow and update — should not increment
  state.nextSequence = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(tree.updateById(id, 'b'), { entryId: id, key: 1, value: 'b' });
  assert.equal(state.nextSequence, Number.MAX_SAFE_INTEGER, 'updateById must not increment nextSequence');
  assert.equal(tree.get(1), 'b');
});
