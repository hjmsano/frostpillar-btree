import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeValidationError,
  InMemoryBTree,
} from '../src/index.js';
import { computeAutoScaleTier } from '../src/btree/autoScale.js';

void test('autoScale starts at tier 0 with maxLeaf=32', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  const stats = tree.getStats();
  assert.equal(stats.entryCount, 0);
  assert.equal(tree.size(), 0);
  tree.assertInvariants();
});

void test('autoScale rejects explicit maxLeafEntries', (): void => {
  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        autoScale: true,
        maxLeafEntries: 64,
      }),
    BTreeValidationError,
  );
});

void test('autoScale rejects explicit maxBranchChildren', (): void => {
  assert.throws(
    (): InMemoryBTree<number, string> =>
      new InMemoryBTree<number, string>({
        compareKeys: (left: number, right: number): number => left - right,
        autoScale: true,
        maxBranchChildren: 64,
      }),
    BTreeValidationError,
  );
});

void test('autoScale scales up on insert past 1000 entries', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  for (let i = 0; i < 1100; i += 1) {
    tree.put(i, i * 10);
  }

  assert.equal(tree.size(), 1100);
  tree.assertInvariants();

  const snapshot = tree.snapshot();
  for (let i = 0; i < 1100; i += 1) {
    assert.equal(snapshot[i].key, i);
    assert.equal(snapshot[i].value, i * 10);
  }
});

void test('autoScale does not downscale on removal', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  for (let i = 0; i < 1100; i += 1) {
    tree.put(i, i);
  }

  for (let i = 0; i < 1050; i += 1) {
    tree.remove(i);
  }

  assert.equal(tree.size(), 50);
  tree.assertInvariants();

  const snapshot = tree.snapshot();
  for (let i = 0; i < 50; i += 1) {
    assert.equal(snapshot[i].key, 1050 + i);
  }
});

void test('autoScale large scale test with 10000+ entries', (): void => {
  const tree = new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

  for (let i = 0; i < 11000; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 11000);
  tree.assertInvariants();

  const snapshot = tree.snapshot();
  for (let i = 0; i < 11000; i += 1) {
    assert.equal(snapshot[i].key, i);
    assert.equal(snapshot[i].value, i);
  }
});

void test('computeAutoScaleTier returns correct tiers', (): void => {
  const assertTier = (entryCount: number, expectedLeaf: number, expectedBranch: number): void => {
    const tier = computeAutoScaleTier(entryCount);
    assert.equal(tier.maxLeaf, expectedLeaf);
    assert.equal(tier.maxBranch, expectedBranch);
  };
  assertTier(0, 32, 32);
  assertTier(999, 32, 32);
  assertTier(1000, 64, 64);
  assertTier(9999, 64, 64);
  assertTier(10000, 128, 128);
  assertTier(99999, 128, 128);
  assertTier(100000, 256, 128);
  assertTier(999999, 256, 128);
  assertTier(1000000, 512, 256);
  assertTier(5000000, 512, 256);
});
