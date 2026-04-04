import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';

const numCmp = (left: number, right: number): number => left - right;

// These tests ensure correctness of range() with small leaf capacity
// to exercise the bulk-copy fast-path on non-boundary leaves and
// binary-search boundary handling.

void test('range spanning multiple full leaves returns correct entries', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
  });

  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `v${i}`);
  }

  const result = tree.range(3, 17);
  assert.equal(result.length, 15);
  assert.equal(result[0].key, 3);
  assert.equal(result[14].key, 17);
  for (let i = 0; i < result.length; i += 1) {
    assert.equal(result[i].key, i + 3);
  }
});

void test('range with exclusive bounds spanning multiple leaves', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
  });

  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `v${i}`);
  }

  const result = tree.range(3, 17, { lowerBound: 'exclusive', upperBound: 'exclusive' });
  assert.equal(result.length, 13);
  assert.equal(result[0].key, 4);
  assert.equal(result[12].key, 16);
});

void test('range returning entire tree matches snapshot', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
  });

  for (let i = 1; i <= 20; i += 1) {
    tree.put(i, `v${i}`);
  }

  const rangeResult = tree.range(1, 20);
  const snap = tree.snapshot();
  assert.deepEqual(rangeResult, snap);
});

void test('range on single-entry boundary leaf', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 3,
  });

  for (let i = 1; i <= 10; i += 1) {
    tree.put(i, `v${i}`);
  }

  const result = tree.range(5, 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 5);
});

void test('range with duplicate keys across leaves', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
    duplicateKeys: 'allow',
  });

  for (let i = 0; i < 16; i += 1) {
    tree.put(1, `v${i}`);
  }

  const result = tree.range(1, 1);
  assert.equal(result.length, 16);
});

void test('count and range return consistent results for multi-leaf range', (): void => {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: numCmp,
    maxLeafEntries: 4,
  });

  for (let i = 1; i <= 50; i += 1) {
    tree.put(i, `v${i}`);
  }

  const count = tree.count(10, 40);
  const range = tree.range(10, 40);
  assert.equal(count, range.length);
  assert.equal(count, 31);
});
