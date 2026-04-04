import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeInvariantError,
  BTreeValidationError,
  InMemoryBTree,
} from '../src/index.js';

void test('comparator throwing non-BTreeValidationError is re-thrown by assertInvariants', (): void => {
  // The comparator behaves normally during insertion, then throws a plain Error
  // for specific key pairs during assertInvariants. This exercises the re-throw
  // path in assertTransitivityAsInvariant (lines 138-139).
  let shouldThrow = false;
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (shouldThrow && left === 1 && right === 3) {
        throw new Error('boom');
      }
      if (left === right) return 0;
      return left < right ? -1 : 1;
    },
  });

  tree.put(1, 'a');
  tree.put(2, 'b');
  tree.put(3, 'c');

  shouldThrow = true;
  assert.throws(
    (): void => {
      tree.assertInvariants();
    },
    (error: unknown): boolean =>
      error instanceof Error &&
      !(error instanceof BTreeInvariantError) &&
      !(error instanceof BTreeValidationError) &&
      error.message === 'boom',
  );
});

void test('rejects node capacity exceeding upper bound', (): void => {
  assert.throws(
    () =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        maxLeafEntries: 16385,
      }),
    BTreeValidationError,
  );

  assert.throws(
    () =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        maxBranchChildren: 16385,
      }),
    BTreeValidationError,
  );
});
