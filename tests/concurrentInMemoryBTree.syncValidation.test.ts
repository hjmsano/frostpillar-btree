import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeConcurrencyError,
  ConcurrentInMemoryBTree,
  type BTreeMutation,
} from '../src/index.js';

import {
  CustomMutationStore,
  IncompatibleReplayStore,
  PartialBadBatchStore,
  UnknownMutationStore,
} from './helpers/sharedTreeStoreStubs.js';

void test('rejects unknown mutation types from shared store', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new UnknownMutationStore<number, string>(),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('sync does not partially apply mutations when batch contains unknown type', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new PartialBadBatchStore<number, string>(),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);

  // eslint-disable-next-line @typescript-eslint/dot-notation -- testing internal state after error
  assert.equal(tree['tree'].size(), 0);
});

void test('rejects put mutation missing key field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'put', value: 'v' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
  // eslint-disable-next-line @typescript-eslint/dot-notation -- testing internal state after error
  assert.equal(tree['tree'].size(), 0);
});

void test('rejects removeById mutation missing entryId field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'removeById' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects updateById mutation missing value field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'updateById', entryId: 0 } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects null mutation entry with BTreeConcurrencyError', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      null as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects undefined mutation entry with BTreeConcurrencyError', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      undefined as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects init mutation missing configFingerprint field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'init' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects init mutation with mismatched configFingerprint before applying any mutation', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'put', key: 1, value: 'one' } as BTreeMutation<number, string>,
      { type: 'init', configFingerprint: 'wrong-fingerprint' } as BTreeMutation<number, string>,
      { type: 'put', key: 2, value: 'two' } as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);

  // eslint-disable-next-line @typescript-eslint/dot-notation -- testing internal state after error
  assert.equal(tree['tree'].size(), 0, 'no mutations should be applied when fingerprint mismatches');
});

void test('sync throws BTreeConcurrencyError when replay throws mid-batch (runtime failure after validation)', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new IncompatibleReplayStore<number, string>(),
    enableEntryIdLookup: false,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, (error: unknown): boolean => {
    assert.ok(error instanceof BTreeConcurrencyError, 'must be BTreeConcurrencyError');
    // The wrapped error must include the original error's message for debugging (spec 6.3).
    assert.ok(
      error.message.includes('Replay failure'),
      `must include replay failure prefix, got: ${error.message}`,
    );
    assert.ok(
      error.message.length > 'Replay failure:'.length + 30,
      `must include original cause detail, got: ${error.message}`,
    );
    return true;
  });

  // currentVersion must remain at 0 — the failed sync must not advance the version
  // eslint-disable-next-line @typescript-eslint/dot-notation -- testing internal state after error
  assert.equal(tree['currentVersion'], 0n, 'currentVersion must not advance on replay failure');
});

// --- putMany negative validation ---

void test('rejects putMany mutation missing entries field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'putMany' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects putMany mutation with non-array entries', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'putMany', entries: 'not-an-array' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects putMany mutation with entry missing key', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'putMany', entries: [{ value: 'v' }] } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects putMany mutation with entry missing value', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'putMany', entries: [{ key: 1 }] } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects putMany mutation with null entry in array', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'putMany', entries: [null] } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

// --- deleteRange negative validation ---

void test('rejects deleteRange mutation missing startKey', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'deleteRange', endKey: 10 } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('rejects deleteRange mutation missing endKey', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'deleteRange', startKey: 1 } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

// --- remove negative validation ---

void test('rejects remove mutation missing key field', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new CustomMutationStore([
      { type: 'remove' } as unknown as BTreeMutation<number, string>,
    ]),
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);
});

void test('instance is permanently poisoned after a replay runtime failure', async (): Promise<void> => {
  const tree = new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    store: new IncompatibleReplayStore<number, string>(),
    enableEntryIdLookup: false,
  });

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);

  await assert.rejects(async (): Promise<void> => {
    await tree.sync();
  }, BTreeConcurrencyError);

  await assert.rejects(async (): Promise<void> => {
    await tree.size();
  }, BTreeConcurrencyError);
});
