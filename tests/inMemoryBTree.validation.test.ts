import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeConcurrencyError,
  BTreeInvariantError,
  BTreeValidationError,
  ConcurrentInMemoryBTree,
  InMemoryBTree,
} from '../src/index.js';

void test('rejects invalid node capacities', (): void => {
  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        maxLeafEntries: 2,
      }),
    BTreeValidationError,
  );

  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        maxBranchChildren: 2,
      }),
    BTreeValidationError,
  );
});

void test('rejects non-function compareKeys at runtime', (): void => {
  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: undefined as unknown as (
          left: number,
          right: number,
        ) => number,
      }),
    BTreeValidationError,
  );
});

void test('comparator NaN is detected by assertInvariants', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (): number => Number.NaN,
  });

  tree.put(1, 'one');
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});

void test('comparator reflexivity violation is detected by assertInvariants', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (left === right) {
        return 1;
      }
      return left < right ? -1 : 1;
    },
  });

  tree.put(1, 'one');
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});

void test('comparator transitivity violation is detected by assertInvariants', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (left === right) {
        return 0;
      }
      const leftClass = left % 3;
      const rightClass = right % 3;
      return (leftClass + 1) % 3 === rightClass ? -1 : 1;
    },
  });

  tree.put(0, 'zero');
  tree.put(1, 'one');
  tree.put(2, 'two');
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});

void test('insert path does not eagerly reject transitivity violations', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (left === right) {
        return 0;
      }
      const leftClass = left % 3;
      const rightClass = right % 3;
      return (leftClass + 1) % 3 === rightClass ? -1 : 1;
    },
  });

  tree.put(0, 'zero');
  tree.put(1, 'one');
  tree.put(2, 'two');

  assert.equal(tree.size(), 3);
  assert.equal(tree.snapshot().length, 3);
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});

void test('peekById, removeById, and updateById return null for non-existent entryId', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    enableEntryIdLookup: true,
  });

  const id = tree.put(1, 'one');
  tree.removeById(id);

  assert.equal(tree.peekById(id), null);
  assert.equal(tree.removeById(id), null);
  assert.equal(tree.updateById(id, 'updated'), null);
  assert.equal(tree.size(), 0);
});

void test('EntryId operations throw when enableEntryIdLookup is disabled', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    enableEntryIdLookup: false,
  });

  const id = tree.put(1, 'one');
  assert.throws((): void => {
    tree.peekById(id);
  }, BTreeValidationError);
  assert.throws((): void => {
    tree.updateById(id, 'ONE');
  }, BTreeValidationError);
  assert.throws((): void => {
    tree.removeById(id);
  }, BTreeValidationError);
});

void test('peekFirst returns entryId with the smallest entry', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  assert.equal(tree.peekFirst(), null);

  const id5 = tree.put(5, 'five');
  tree.put(10, 'ten');

  assert.deepEqual(tree.peekFirst(), { entryId: id5, key: 5, value: 'five' });
  assert.equal(tree.size(), 2);
});

void test('peekFirst is idempotent and does not modify tree state', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
  });

  const id1 = tree.put(1, 'one');
  tree.put(2, 'two');

  const first1 = tree.peekFirst();
  const first2 = tree.peekFirst();
  assert.deepEqual(first1, first2);
  assert.deepEqual(first1, { entryId: id1, key: 1, value: 'one' });
  assert.equal(tree.size(), 2);
  assert.equal(tree.snapshot().length, 2);
});

void test('comparator Infinity and -Infinity are detected by assertInvariants', (): void => {
  const treePositiveInfinity = new InMemoryBTree<number, string>({
    compareKeys: (): number => Infinity,
  });

  treePositiveInfinity.put(1, 'one');
  assert.throws((): void => {
    treePositiveInfinity.assertInvariants();
  }, BTreeInvariantError);

  const treeNegativeInfinity = new InMemoryBTree<number, string>({
    compareKeys: (): number => -Infinity,
  });

  treeNegativeInfinity.put(1, 'one');
  assert.throws((): void => {
    treeNegativeInfinity.assertInvariants();
  }, BTreeInvariantError);
});

void test('normal read path does not eagerly reject non-finite comparator results', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (): number => Number.NaN,
  });

  tree.put(1, 'one');
  assert.doesNotThrow((): void => {
    tree.range(1, 1);
  });
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});

const countInsertComparisonsForUniqueKey = (
  duplicateKeys: 'allow' | 'reject' | 'replace',
): number => {
  let comparisonCount = 0;
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => {
      comparisonCount += 1;
      return left - right;
    },
    duplicateKeys,
    maxLeafEntries: 8,
    maxBranchChildren: 8,
    enableEntryIdLookup: false,
  });

  for (let index = 0; index < 256; index += 1) {
    tree.put(index * 2, index);
  }

  comparisonCount = 0;
  tree.put(777, 777);
  return comparisonCount;
};

void test('replace/reject insert path resolves uniqueness without a separate pre-scan traversal', (): void => {
  const allowCount = countInsertComparisonsForUniqueKey('allow');
  const replaceCount = countInsertComparisonsForUniqueKey('replace');
  const rejectCount = countInsertComparisonsForUniqueKey('reject');

  assert.ok(
    replaceCount <= allowCount + 3,
    `replace insert should be single-pass; allow=${String(allowCount)} replace=${String(replaceCount)}`,
  );
  assert.ok(
    rejectCount <= allowCount + 3,
    `reject insert should be single-pass; allow=${String(allowCount)} reject=${String(rejectCount)}`,
  );
});

void test('rejects maxRetries exceeding upper bound', (): void => {
  assert.throws(
    () =>
      new ConcurrentInMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        store: {
          getLogEntriesSince: () =>
            Promise.resolve({ version: 0n, mutations: [] }),
          append: () => Promise.resolve({ applied: false, version: 0n }),
        },
        maxRetries: 1025,
      }),
    BTreeConcurrencyError,
  );
});

void test('rejects invalid maxSyncMutationsPerBatch', (): void => {
  assert.throws(
    () =>
      new ConcurrentInMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        store: {
          getLogEntriesSince: () =>
            Promise.resolve({ version: 0n, mutations: [] }),
          append: () => Promise.resolve({ applied: false, version: 0n }),
        },
        maxSyncMutationsPerBatch: 0,
      }),
    BTreeConcurrencyError,
  );
});

void test('rejects invalid duplicateKeys value', (): void => {
  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        duplicateKeys: 'invalid' as 'allow',
      }),
    BTreeValidationError,
  );
});

void test('comparator descending transitivity violation is detected by assertInvariants', (): void => {
  // Use a stateful comparator: during insertion it sorts normally (ascending),
  // then during assertInvariants it produces a descending non-transitive pattern.
  // Stored leaf order after insert: [1, 2, 3].
  // Check phase: compare(1,2)>0, compare(2,3)>0, but compare(1,3)<=0 → violation.
  let phase: 'insert' | 'check' = 'insert';
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => {
      if (left === right) return 0;
      if (phase === 'insert') {
        return left < right ? -1 : 1;
      }
      if (left === 1 && right === 2) return 1;
      if (left === 2 && right === 1) return -1;
      if (left === 2 && right === 3) return 1;
      if (left === 3 && right === 2) return -1;
      if (left === 1 && right === 3) return -1;
      if (left === 3 && right === 1) return 1;
      return left < right ? -1 : 1;
    },
  });

  tree.put(1, 'one');
  tree.put(2, 'two');
  tree.put(3, 'three');

  phase = 'check';
  assert.throws((): void => {
    tree.assertInvariants();
  }, BTreeInvariantError);
});
