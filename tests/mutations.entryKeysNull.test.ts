import assert from 'node:assert/strict';
import test from 'node:test';

import { BTreeInvariantError, InMemoryBTree } from '../src/index.js';
import {
  removeEntryById,
  peekEntryById,
  updateEntryById,
} from '../src/btree/mutations.js';
import type { BTreeState } from '../src/btree/types.js';
import type { EntryId } from '../src/btree/types.js';

const makeStateWithNullEntryKeys = (): {
  state: BTreeState<number, string>;
  id: EntryId;
} => {
  // Build a tree with entryKeys enabled to get a valid EntryId...
  const treeWithKeys = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    enableEntryIdLookup: true,
  });
  const id = treeWithKeys.put(1, 'one');

  // ...then extract a state where entryKeys is null (lookup disabled).
  const treeNoKeys = new InMemoryBTree<number, string>({
    compareKeys: (a: number, b: number): number => a - b,
    enableEntryIdLookup: false,
  });
  treeNoKeys.put(1, 'one');
  const state = (treeNoKeys as unknown as { state: BTreeState<number, string> })
    .state;
  return { state, id };
};

void test('removeEntryById throws BTreeInvariantError when entryKeys is null', (): void => {
  const { state, id } = makeStateWithNullEntryKeys();
  assert.throws(
    (): void => {
      removeEntryById(state, id);
    },
    (error: unknown): boolean =>
      error instanceof BTreeInvariantError &&
      error.message.includes('entryKeys'),
  );
});

void test('peekEntryById throws BTreeInvariantError when entryKeys is null', (): void => {
  const { state, id } = makeStateWithNullEntryKeys();
  assert.throws(
    (): void => {
      peekEntryById(state, id);
    },
    (error: unknown): boolean =>
      error instanceof BTreeInvariantError &&
      error.message.includes('entryKeys'),
  );
});

void test('updateEntryById throws BTreeInvariantError when entryKeys is null', (): void => {
  const { state, id } = makeStateWithNullEntryKeys();
  assert.throws(
    (): void => {
      updateEntryById(state, id, 'updated');
    },
    (error: unknown): boolean =>
      error instanceof BTreeInvariantError &&
      error.message.includes('entryKeys'),
  );
});
