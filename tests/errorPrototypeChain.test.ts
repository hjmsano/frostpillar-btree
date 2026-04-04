import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BTreeConcurrencyError,
  BTreeInvariantError,
  BTreeValidationError,
} from '../src/index.js';

void describe('BTreeValidationError prototype chain', (): void => {
  const error = new BTreeValidationError('validation message');

  void test('instanceof Error', (): void => {
    assert.equal(error instanceof Error, true);
  });

  void test('instanceof BTreeValidationError', (): void => {
    assert.equal(error instanceof BTreeValidationError, true);
  });

  void test('.name is "BTreeValidationError"', (): void => {
    assert.equal(error.name, 'BTreeValidationError');
  });

  void test('.message is preserved', (): void => {
    assert.equal(error.message, 'validation message');
  });

  void test('.stack is a non-empty string', (): void => {
    assert.equal(typeof error.stack, 'string');
    assert.ok((error.stack ?? '').length > 0);
  });

  void test('not instanceof BTreeInvariantError', (): void => {
    assert.equal(error instanceof BTreeInvariantError, false);
  });

  void test('not instanceof BTreeConcurrencyError', (): void => {
    assert.equal(error instanceof BTreeConcurrencyError, false);
  });
});

void describe('BTreeInvariantError prototype chain', (): void => {
  const error = new BTreeInvariantError('invariant message');

  void test('instanceof Error', (): void => {
    assert.equal(error instanceof Error, true);
  });

  void test('instanceof BTreeInvariantError', (): void => {
    assert.equal(error instanceof BTreeInvariantError, true);
  });

  void test('.name is "BTreeInvariantError"', (): void => {
    assert.equal(error.name, 'BTreeInvariantError');
  });

  void test('.message is preserved', (): void => {
    assert.equal(error.message, 'invariant message');
  });

  void test('.stack is a non-empty string', (): void => {
    assert.equal(typeof error.stack, 'string');
    assert.ok((error.stack ?? '').length > 0);
  });

  void test('not instanceof BTreeValidationError', (): void => {
    assert.equal(error instanceof BTreeValidationError, false);
  });

  void test('not instanceof BTreeConcurrencyError', (): void => {
    assert.equal(error instanceof BTreeConcurrencyError, false);
  });
});

void describe('BTreeConcurrencyError prototype chain', (): void => {
  const error = new BTreeConcurrencyError('concurrency message');

  void test('instanceof Error', (): void => {
    assert.equal(error instanceof Error, true);
  });

  void test('instanceof BTreeConcurrencyError', (): void => {
    assert.equal(error instanceof BTreeConcurrencyError, true);
  });

  void test('.name is "BTreeConcurrencyError"', (): void => {
    assert.equal(error.name, 'BTreeConcurrencyError');
  });

  void test('.message is preserved', (): void => {
    assert.equal(error.message, 'concurrency message');
  });

  void test('.stack is a non-empty string', (): void => {
    assert.equal(typeof error.stack, 'string');
    assert.ok((error.stack ?? '').length > 0);
  });

  void test('not instanceof BTreeValidationError', (): void => {
    assert.equal(error instanceof BTreeValidationError, false);
  });

  void test('not instanceof BTreeInvariantError', (): void => {
    assert.equal(error instanceof BTreeInvariantError, false);
  });
});
