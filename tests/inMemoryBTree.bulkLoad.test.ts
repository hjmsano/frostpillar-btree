import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree, BTreeInvariantError } from '../src/index.js';
import { bulkLoadEntries } from '../src/btree/bulkLoad.js';
import type { BTreeState } from '../src/btree/types.js';

void test('bulkLoadEntries guard fires before state mutation on non-empty tree', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    enableEntryIdLookup: true,
  });
  tree.put(1, 'a');

  const state = (tree as unknown as { state: BTreeState<number, string> })
    .state;
  const seqBefore = state.nextSequence;
  const keysBefore = state.entryKeys!.size;

  assert.throws(
    () =>
      bulkLoadEntries(state, [
        { key: 10, value: 'x' },
        { key: 20, value: 'y' },
      ]),
    (error: Error) =>
      error instanceof BTreeInvariantError &&
      error.message.includes('empty tree'),
  );

  assert.equal(
    state.nextSequence,
    seqBefore,
    'nextSequence must not be mutated',
  );
  assert.equal(
    state.entryKeys!.size,
    keysBefore,
    'entryKeys must not be mutated',
  );
});

void test('tree remains usable after bulkLoadEntries guard failure', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    enableEntryIdLookup: true,
  });
  tree.put(1, 'a');

  const state = (tree as unknown as { state: BTreeState<number, string> })
    .state;
  assert.throws(
    () => bulkLoadEntries(state, [{ key: 10, value: 'x' }]),
    (error: Error) => error instanceof BTreeInvariantError,
  );

  // Tree must still be fully functional after the error
  assert.equal(tree.size(), 1);
  assert.equal(tree.get(1), 'a');

  const id2 = tree.put(2, 'b');
  assert.equal(tree.size(), 2);
  assert.equal(tree.get(2), 'b');
  assert.notEqual(tree.peekById(id2), null);

  tree.remove(1);
  assert.equal(tree.size(), 1);
  tree.assertInvariants();
});
