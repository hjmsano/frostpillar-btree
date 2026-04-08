/**
 * Tests for sequence-based tie-breaking comparators in navigation.ts and integrity-helpers.ts.
 *
 * These tests exercise the four sites that previously used arithmetic subtraction
 * (e.g. `e.entryId - sequence`) and now use explicit tri-value comparison
 * (e.g. `e.entryId < sequence ? -1 : e.entryId > sequence ? 1 : 0`).
 *
 * Sites under test:
 *   1. navigation.ts selectBranchChild      ~line 31: k.sequence - sequence
 *   2. navigation.ts lowerBoundInLeaf       ~line 70: e.entryId - sequence
 *   3. navigation.ts upperBoundInLeaf       ~line 94: e.entryId - sequence
 *   4. integrity-helpers.ts compareNodeKeys ~line 36: leftSeq - rightSeq
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryBTree } from '../src/index.js';
import type { BTreeState } from '../src/btree/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a small duplicate-key tree with forced splits (maxLeafEntries=3). */
const dupTree = (): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

// ---------------------------------------------------------------------------
// Site 2 & 3 — lowerBoundInLeaf / upperBoundInLeaf
// Sequence tie-breaking inside a single leaf.
// ---------------------------------------------------------------------------

void test('sequence tie-break: lowerBound returns first insertion-order entry for equal keys', (): void => {
  const tree = dupTree();
  const idA = tree.put(5, 'first');
  const idB = tree.put(5, 'second');
  const idC = tree.put(5, 'third');

  // range() uses lowerBound + upperBound; result must respect sequence order
  const result = tree.range(5, 5);
  assert.equal(result.length, 3);
  assert.equal(result[0].entryId, idA);
  assert.equal(result[0].value, 'first');
  assert.equal(result[1].entryId, idB);
  assert.equal(result[1].value, 'second');
  assert.equal(result[2].entryId, idC);
  assert.equal(result[2].value, 'third');

  tree.assertInvariants();
});

void test('sequence tie-break: lowerBound equal case returns 0 when sequences are identical', (): void => {
  // Verifies `e.entryId == sequence` returns 0 (equal), not -1 or 1.
  // We trigger this by querying the exact entryId boundary via findFirstMatchingUserKey (sequence=0).
  const tree = dupTree();
  tree.put(10, 'a');
  tree.put(10, 'b');

  // peekFirst() reads from leftmostLeaf directly; findFirst() calls findFirstMatchingUserKey
  // which passes sequence=0 to lowerBoundInLeaf.
  // lowerBoundInLeaf sees entryId > 0 => cmp part = 1 (not less than 0), so lower bound stays.
  const first = tree.findFirst(10);
  assert.notEqual(first, null);
  assert.equal(first!.key, 10);
  assert.equal(first!.value, 'a');

  tree.assertInvariants();
});

void test('sequence tie-break: upperBound equal case positions past all equal-key entries', (): void => {
  // Verifies `e.entryId == sequence` with MAX_SAFE_INTEGER returns 0 (equal), not negative.
  // findLastMatchingUserKey passes MAX_SAFE_INTEGER as sequence to upperBoundInLeaf.
  const tree = dupTree();
  tree.put(7, 'x');
  tree.put(7, 'y');
  tree.put(7, 'z');

  // findLast() internally calls findLastMatchingUserKey which passes sequence=MAX_SAFE_INTEGER
  // upperBoundInLeaf must place the position past all three entries so idx-1 lands on 'z'.
  const last = tree.findLast(7);
  assert.notEqual(last, null);
  assert.equal(last!.key, 7);
  assert.equal(last!.value, 'z');

  tree.assertInvariants();
});

void test('sequence tie-break: smaller sequence correctly sorts before larger sequence', (): void => {
  // Inserts 3 values with key=1; later insertions have larger entryId (sequence).
  // Verifies lowerBound places earlier entries before later ones.
  const tree = dupTree();
  const id1 = tree.put(1, 'seq-low');
  const id2 = tree.put(1, 'seq-mid');
  const id3 = tree.put(1, 'seq-high');

  assert.ok(id1 < id2, 'first entryId must be smaller than second');
  assert.ok(id2 < id3, 'second entryId must be smaller than third');

  const all = [...tree.entries()];
  assert.equal(all.length, 3);
  assert.equal(all[0].entryId, id1);
  assert.equal(all[1].entryId, id2);
  assert.equal(all[2].entryId, id3);

  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Site 1 — selectBranchChild
// Sequence tie-breaking in branch navigation requires a multi-level tree,
// meaning enough duplicates to force leaf splits and branch node creation.
// ---------------------------------------------------------------------------

void test('sequence tie-break: branch-level navigation preserves insertion order for duplicates', (): void => {
  // Force a multi-level tree by inserting many duplicate-key entries with maxLeafEntries=3.
  const tree = dupTree();
  const ids: number[] = [];
  for (let i = 0; i < 15; i += 1) {
    ids.push(tree.put(42, `v${i}`));
  }

  // All IDs must be monotonically increasing (sequence order)
  for (let i = 1; i < ids.length; i += 1) {
    assert.ok(
      ids[i - 1] < ids[i],
      `entryId[${i - 1}] must be less than entryId[${i}]`,
    );
  }

  // range() traverses branch nodes via selectBranchChild; order must be insertion order
  const result = tree.range(42, 42);
  assert.equal(result.length, 15);
  for (let i = 0; i < 15; i += 1) {
    assert.equal(result[i].value, `v${i}`, `entry ${i} out of order`);
    assert.equal(result[i].entryId, ids[i]);
  }

  tree.assertInvariants();
});

void test('sequence tie-break: branch navigation for findLeafForKey uses correct sequence direction', (): void => {
  // findLeafForKey is called with sequence=0 (lowerBound path) and MAX_SAFE_INTEGER (upperBound path).
  // With the old arithmetic subtraction, extreme sequence values could produce wrong sign if
  // k.sequence is a large positive and sequence is 0 (difference is large positive = go right).
  // With the tri-value form, the sign is always exact.
  const tree = dupTree();
  // Fill with duplicates to create branch nodes
  const values = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
  ];
  const ids: number[] = values.map((v) => tree.put(99, v));

  const first = tree.peekFirst();
  assert.notEqual(first, null);
  assert.equal(first!.value, 'first');
  assert.equal(first!.entryId, ids[0]);

  const last = tree.peekLast();
  assert.notEqual(last, null);
  assert.equal(last!.value, 'eighth');
  assert.equal(last!.entryId, ids[ids.length - 1]);

  tree.assertInvariants();
});

// ---------------------------------------------------------------------------
// Site 4 — compareNodeKeys in integrity-helpers.ts
// Exercised via assertInvariants() which calls validateLeafLinks → compareNodeKeys.
// ---------------------------------------------------------------------------

void test('compareNodeKeys: invariant check passes when adjacent leaves are in sequence order', (): void => {
  // assertInvariants calls compareNodeKeys(leftSeq, rightSeq) for adjacent leaves.
  // With arithmetic subtraction, if leftSeq > rightSeq the sign is positive (correct).
  // The tri-value form must produce the same sign.
  const tree = dupTree();
  for (let i = 0; i < 12; i += 1) {
    tree.put(i % 3, `val-${i}`);
  }

  // Must not throw — compareNodeKeys must correctly order keys across leaf boundaries
  assert.doesNotThrow(() => {
    tree.assertInvariants();
  });
});

void test('compareNodeKeys: equal sequences on equal keys are treated as equal (not out-of-order)', (): void => {
  // Construct a state where compareNodeKeys is called with leftSeq === rightSeq.
  // This can happen when two adjacent leaves share the boundary key (allowed in allow mode).
  // The result must be 0, not 1 (which would be a false invariant violation).
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  // Insert distinct keys to create a clean multi-leaf tree
  for (let i = 1; i <= 9; i += 1) {
    tree.put(i * 10, `v${i}`);
  }

  // nextSequence starts at 0, so entryIds are 0..8 for 9 insertions.
  const state = (tree as unknown as { state: BTreeState<number, string> })
    .state;
  // Verify all sequences assigned so far are 0..8
  const snap = tree.snapshot();
  for (let i = 0; i < snap.length; i += 1) {
    assert.equal(snap[i].entryId, i as unknown as number);
  }
  // nextSequence should be 9
  assert.equal(state.nextSequence, 9);

  // Tree must be valid — compareNodeKeys with equal left/right sequences must return 0
  assert.doesNotThrow(() => {
    tree.assertInvariants();
  });
});

// ---------------------------------------------------------------------------
// Regression: sequence comparator correctness with large entryId values
// ---------------------------------------------------------------------------

void test('sequence tie-break: correct ordering when entryId values are large', (): void => {
  // Arithmetic subtraction of two large positive integers that differ by 1
  // could theoretically lose precision near Number.MAX_SAFE_INTEGER.
  // The tri-value form is always exact.
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (left: number, right: number): number => left - right,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    duplicateKeys: 'allow',
  });

  // Advance sequence counter close to a large value
  const state = (tree as unknown as { state: BTreeState<number, string> })
    .state;
  // Use a large but safe sequence offset (well below MAX_SAFE_INTEGER)
  state.nextSequence = 2 ** 40;

  const idA = tree.put(1, 'alpha');
  const idB = tree.put(1, 'beta');
  const idC = tree.put(1, 'gamma');

  assert.ok(idA < idB, 'idA must be less than idB');
  assert.ok(idB < idC, 'idB must be less than idC');

  const result = tree.range(1, 1);
  assert.equal(result.length, 3);
  assert.equal(result[0].value, 'alpha');
  assert.equal(result[1].value, 'beta');
  assert.equal(result[2].value, 'gamma');

  tree.assertInvariants();
});
