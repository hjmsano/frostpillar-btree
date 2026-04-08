import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTreeValidationError,
  InMemoryBTree,
  type BTreeJSON,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const compareNumbers = (left: number, right: number): number => left - right;

const numTree = (opts?: {
  duplicateKeys?: 'allow' | 'reject' | 'replace';
  enableEntryIdLookup?: boolean;
  autoScale?: boolean;
  maxLeafEntries?: number;
  maxBranchChildren?: number;
}): InMemoryBTree<number, string> =>
  new InMemoryBTree<number, string>({
    compareKeys: compareNumbers,
    maxLeafEntries: 3,
    maxBranchChildren: 3,
    ...opts,
  });

// ===========================================================================
// fromJSON() input validation
// ===========================================================================

void test('fromJSON() throws on unsupported or missing version', (): void => {
  const json = numTree().toJSON();
  (json as { version: number }).version = 999;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
  assert.throws(
    () =>
      InMemoryBTree.fromJSON({} as BTreeJSON<number, string>, compareNumbers),
    (err: Error) => err.constructor.name === 'BTreeValidationError',
  );
});

void test('fromJSON() throws BTreeValidationError when config is missing', (): void => {
  assert.throws(
    () =>
      InMemoryBTree.fromJSON(
        { version: 1 } as BTreeJSON<number, string>,
        compareNumbers,
      ),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('config'),
  );
});

void test('fromJSON() throws BTreeValidationError when config is not an object', (): void => {
  assert.throws(
    () =>
      InMemoryBTree.fromJSON(
        { version: 1, config: 42, entries: [] } as unknown as BTreeJSON<
          number,
          string
        >,
        compareNumbers,
      ),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('config'),
  );
});

void test('fromJSON() throws BTreeValidationError when entries is missing', (): void => {
  const json = numTree().toJSON();
  delete (json as unknown as Record<string, unknown>).entries;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('entries'),
  );
});

void test('fromJSON() throws BTreeValidationError when entries is not an array', (): void => {
  const json = numTree().toJSON();
  (json as unknown as Record<string, unknown>).entries = 'not-an-array';
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('entries'),
  );
});

void test('fromJSON() throws BTreeValidationError when config.duplicateKeys is missing', (): void => {
  const json = numTree().toJSON();
  delete (json.config as Record<string, unknown>).duplicateKeys;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('duplicateKeys'),
  );
});

void test('fromJSON() throws BTreeValidationError when config.duplicateKeys is invalid', (): void => {
  const json = numTree().toJSON();
  (json.config as Record<string, unknown>).duplicateKeys = 'invalid';
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('duplicateKeys'),
  );
});

void test('fromJSON() throws BTreeValidationError when entry is not a tuple', (): void => {
  const json = numTree().toJSON();
  (json as unknown as { entries: unknown[] }).entries = [42];
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('entries[0]'),
  );
});

void test('fromJSON() throws BTreeValidationError when entry tuple has wrong length', (): void => {
  const json = numTree().toJSON();
  (json as unknown as { entries: unknown[] }).entries = [[1]];
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('entries[0]'),
  );
});

void test('fromJSON() throws BTreeValidationError for malformed entry at later index', (): void => {
  const json = numTree().toJSON();
  (json as unknown as { entries: unknown[] }).entries = [[1, 'a'], 'bad'];
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err.constructor.name === 'BTreeValidationError' &&
      err.message.includes('entries[1]'),
  );
});

void test('fromJSON() throws BTreeValidationError when entries array is too large', (): void => {
  const fakeEntries = Object.assign([], { length: 1_000_001 }) as [
    number,
    string,
  ][];
  const json = {
    version: 1,
    config: {
      maxLeafEntries: 64,
      maxBranchChildren: 64,
      duplicateKeys: 'replace' as const,
      enableEntryIdLookup: false,
      autoScale: false,
    },
    entries: fakeEntries,
  };
  assert.throws(
    () => InMemoryBTree.fromJSON(json, (a: number, b: number) => a - b),
    (error: Error) =>
      error instanceof BTreeValidationError &&
      error.message.includes('exceeds maximum'),
  );
});

// ===========================================================================
// fromJSON() config field validation
// ===========================================================================

void test('fromJSON() throws BTreeValidationError when enableEntryIdLookup is not a boolean', (): void => {
  const json = numTree().toJSON();
  (json.config as Record<string, unknown>).enableEntryIdLookup = 'yes';
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('enableEntryIdLookup'),
  );
});

void test('fromJSON() throws BTreeValidationError when autoScale is not a boolean', (): void => {
  const json = numTree().toJSON();
  (json.config as Record<string, unknown>).autoScale = 1;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError && err.message.includes('autoScale'),
  );
});

void test('fromJSON() throws BTreeValidationError when maxLeafEntries is not a number', (): void => {
  const json = numTree().toJSON();
  (json.config as Record<string, unknown>).maxLeafEntries = '64';
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('maxLeafEntries'),
  );
});

void test('fromJSON() throws BTreeValidationError when maxBranchChildren is not a number', (): void => {
  const json = numTree().toJSON();
  (json.config as Record<string, unknown>).maxBranchChildren = null;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('maxBranchChildren'),
  );
});

void test('fromJSON() throws BTreeValidationError when maxLeafEntries is below minimum', (): void => {
  const json = numTree().toJSON();
  json.config.maxLeafEntries = 2;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('maxLeafEntries'),
  );
});

void test('fromJSON() throws BTreeValidationError when maxLeafEntries is a float', (): void => {
  const json = numTree().toJSON();
  json.config.maxLeafEntries = 3.5;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('maxLeafEntries'),
  );
});

void test('fromJSON() throws BTreeValidationError when maxBranchChildren exceeds maximum', (): void => {
  const json = numTree().toJSON();
  json.config.maxBranchChildren = 99999;
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError &&
      err.message.includes('maxBranchChildren'),
  );
});

// ===========================================================================
// fromJSON() entry sort/duplicate validation — error message distinction
// ===========================================================================

void test('fromJSON() reports unsorted entries distinctly from duplicate keys (strict mode)', (): void => {
  const json = numTree().toJSON();
  json.entries = [
    [3, 'c'],
    [1, 'a'],
  ]; // unsorted, not duplicates
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError && err.message.includes('not sorted'),
  );
});

void test('fromJSON() reports duplicate keys distinctly from unsorted entries (strict mode)', (): void => {
  const json = numTree().toJSON();
  json.entries = [
    [1, 'a'],
    [1, 'b'],
  ]; // duplicate, but sorted
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError && err.message.includes('duplicate'),
  );
});

void test('fromJSON() reports unsorted entries in allow-duplicates mode', (): void => {
  const json = numTree({ duplicateKeys: 'allow' }).toJSON();
  json.entries = [
    [3, 'c'],
    [1, 'a'],
  ]; // unsorted
  assert.throws(
    () => InMemoryBTree.fromJSON(json, compareNumbers),
    (err: Error) =>
      err instanceof BTreeValidationError && err.message.includes('not sorted'),
  );
});
