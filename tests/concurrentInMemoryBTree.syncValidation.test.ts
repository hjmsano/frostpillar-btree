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
  }, BTreeConcurrencyError);

  // currentVersion must remain at 0 — the failed sync must not advance the version
  // eslint-disable-next-line @typescript-eslint/dot-notation -- testing internal state after error
  assert.equal(tree['currentVersion'], 0n, 'currentVersion must not advance on replay failure');
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
