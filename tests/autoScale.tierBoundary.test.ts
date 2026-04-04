import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';
import type { BTreeState } from '../src/btree/types.js';

interface InternalTree {
  state: BTreeState<number, number>;
}

const accessState = (tree: InMemoryBTree<number, number>): BTreeState<number, number> =>
  (tree as unknown as InternalTree).state;

const createAutoScaleTree = (): InMemoryBTree<number, number> =>
  new InMemoryBTree<number, number>({
    compareKeys: (left: number, right: number): number => left - right,
    autoScale: true,
  });

void test('autoScale: 999 entries stays at tier 0 (maxLeaf=32)', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 999; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 999);
  const state = accessState(tree);
  assert.equal(state.maxLeafEntries, 32);
  tree.assertInvariants();
});

void test('autoScale: 1000 entries transitions to tier 1 (maxLeaf=64)', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 1000; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 1000);
  const state = accessState(tree);
  assert.equal(state.maxLeafEntries, 64);
  tree.assertInvariants();
});

void test('autoScale: 9999 entries stays at tier 1 (maxLeaf=64)', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 9999; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 9999);
  const state = accessState(tree);
  assert.equal(state.maxLeafEntries, 64);
  tree.assertInvariants();
});

void test('autoScale: 10000 entries transitions to tier 2 (maxLeaf=128)', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 10000; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 10000);
  const state = accessState(tree);
  assert.equal(state.maxLeafEntries, 128);
  tree.assertInvariants();
});

void test('autoScale: removing entries below threshold does NOT decrease capacity', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 1000; i += 1) {
    tree.put(i, i);
  }

  const stateAfterScaleUp = accessState(tree);
  assert.equal(stateAfterScaleUp.maxLeafEntries, 64);

  for (let i = 0; i < 900; i += 1) {
    tree.remove(i);
  }

  assert.equal(tree.size(), 100);
  const stateAfterRemoval = accessState(tree);
  assert.equal(stateAfterRemoval.maxLeafEntries, 64);
  tree.assertInvariants();
});

void test('autoScale: mass deletion does NOT downscale — capacity preserved at high-water mark', (): void => {
  const tree = createAutoScaleTree();

  // Scale up to tier 2 (10000+)
  for (let i = 0; i < 10_000; i += 1) {
    tree.put(i, i);
  }
  const stateAtPeak = accessState(tree);
  assert.equal(stateAtPeak.maxLeafEntries, 128);
  assert.equal(stateAtPeak.maxBranchChildren, 128);

  // Delete almost everything via popFirst
  for (let i = 0; i < 9_990; i += 1) {
    tree.popFirst();
  }
  assert.equal(tree.size(), 10);

  // Capacity must still be at tier 2
  const stateAfterDeletion = accessState(tree);
  assert.equal(stateAfterDeletion.maxLeafEntries, 128, 'maxLeafEntries should not decrease after deletion');
  assert.equal(stateAfterDeletion.maxBranchChildren, 128, 'maxBranchChildren should not decrease after deletion');
  tree.assertInvariants();
});

void test('autoScale: deleteRange does NOT downscale capacity', (): void => {
  const tree = createAutoScaleTree();
  for (let i = 0; i < 1000; i += 1) {
    tree.put(i, i);
  }
  const state = accessState(tree);
  assert.equal(state.maxLeafEntries, 64);

  tree.deleteRange(0, 990);
  assert.equal(tree.size(), 9);
  assert.equal(accessState(tree).maxLeafEntries, 64, 'capacity should remain after deleteRange');
  tree.assertInvariants();
});

void test('autoScale: clear then re-insert starts from tier 0 again', (): void => {
  const tree = createAutoScaleTree();

  for (let i = 0; i < 1000; i += 1) {
    tree.put(i, i);
  }

  const stateBeforeClear = accessState(tree);
  assert.equal(stateBeforeClear.maxLeafEntries, 64);

  tree.clear();

  const stateAfterClear = accessState(tree);
  assert.equal(stateAfterClear.maxLeafEntries, 32);
  assert.equal(tree.size(), 0);

  for (let i = 0; i < 10; i += 1) {
    tree.put(i, i);
  }

  assert.equal(tree.size(), 10);
  const stateAfterReinsert = accessState(tree);
  assert.equal(stateAfterReinsert.maxLeafEntries, 32);
  tree.assertInvariants();
});

void test('autoScale: cloned tree scales independently from original', (): void => {
  const original = createAutoScaleTree();

  for (let i = 0; i < 500; i += 1) {
    original.put(i, i);
  }

  const cloned = original.clone();

  assert.equal(cloned.size(), 500);
  assert.equal(accessState(cloned).maxLeafEntries, accessState(original).maxLeafEntries);

  // Scale up the clone past tier 1 boundary without affecting the original
  for (let i = 500; i < 1100; i += 1) {
    cloned.put(i, i);
  }

  assert.equal(accessState(cloned).maxLeafEntries, 64, 'clone should have scaled to tier 1');
  assert.equal(accessState(original).maxLeafEntries, 32, 'original must remain at tier 0');
  assert.equal(original.size(), 500);
  assert.equal(cloned.size(), 1100);
  original.assertInvariants();
  cloned.assertInvariants();
});
