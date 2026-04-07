import { InMemoryBTree, type EntryId, type RangeBounds } from '../InMemoryBTree.js';
import type { KeyComparator, DuplicateKeyPolicy } from '../btree/types.js';
import { BTreeValidationError } from '../errors.js';
import type { BTreeMutation } from './types.js';
import {
  type AnyMutationResult,
  assertNeverMutation,
} from './helpers.js';

export const applyMutationLocal = <TKey, TValue>(
  tree: InMemoryBTree<TKey, TValue>,
  mutation: BTreeMutation<TKey, TValue>,
  onInit: () => void,
): AnyMutationResult<TKey, TValue> => {
  switch (mutation.type) {
    case 'init':
      onInit();
      return null;
    case 'put':
      return tree.put(mutation.key, mutation.value);
    case 'putMany':
      return tree.putMany(mutation.entries);
    case 'remove':
      return tree.remove(mutation.key);
    case 'removeById':
      return tree.removeById(mutation.entryId);
    case 'updateById':
      return tree.updateById(mutation.entryId, mutation.value);
    case 'popFirst':
      return tree.popFirst();
    case 'popLast':
      return tree.popLast();
    case 'deleteRange':
      return tree.deleteRange(mutation.startKey, mutation.endKey, mutation.options);
    case 'clear':
      tree.clear();
      return null;
    default:
      return assertNeverMutation(mutation);
  }
};

export const createPutEvaluator = <TKey, TValue>(
  duplicateKeys: DuplicateKeyPolicy,
  key: TKey,
  value: TValue,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'put'; key: TKey; value: TValue }) => {
  return (tree): { type: 'put'; key: TKey; value: TValue } => {
    if (duplicateKeys === 'reject' && tree.hasKey(key)) {
      throw new BTreeValidationError('Duplicate key rejected.');
    }
    return { type: 'put', key, value };
  };
};

export const createRemoveEvaluator = <TKey, TValue>(
  key: TKey,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'remove'; key: TKey } | null) => {
  return (tree): { type: 'remove'; key: TKey } | null => {
    return tree.hasKey(key) ? { type: 'remove', key } : null;
  };
};

export const createRemoveByIdEvaluator = <TKey, TValue>(
  entryId: EntryId,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'removeById'; entryId: EntryId } | null) => {
  return (tree): { type: 'removeById'; entryId: EntryId } | null => {
    return tree.peekById(entryId) !== null ? { type: 'removeById', entryId } : null;
  };
};

export const createUpdateByIdEvaluator = <TKey, TValue>(
  entryId: EntryId,
  value: TValue,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'updateById'; entryId: EntryId; value: TValue } | null) => {
  return (tree): { type: 'updateById'; entryId: EntryId; value: TValue } | null => {
    return tree.peekById(entryId) !== null ? { type: 'updateById', entryId, value } : null;
  };
};

export const createPopFirstEvaluator = <TKey, TValue>(): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'popFirst' } | null) => {
  return (tree): { type: 'popFirst' } | null => {
    return tree.peekFirst() !== null ? { type: 'popFirst' } : null;
  };
};

export const createPopLastEvaluator = <TKey, TValue>(): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'popLast' } | null) => {
  return (tree): { type: 'popLast' } | null => {
    return tree.peekLast() !== null ? { type: 'popLast' } : null;
  };
};

export const createPutManyEvaluator = <TKey, TValue>(
  entries: readonly { key: TKey; value: TValue }[],
  duplicateKeys: DuplicateKeyPolicy,
  compareKeys: KeyComparator<TKey>,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'putMany'; entries: readonly { key: TKey; value: TValue }[] }) => {
  return (tree): { type: 'putMany'; entries: readonly { key: TKey; value: TValue }[] } => {
    const strictlyAscending = duplicateKeys !== 'allow';
    for (let i = 1; i < entries.length; i += 1) {
      const cmp = compareKeys(entries[i - 1].key, entries[i].key);
      if (cmp > 0) {
        throw new BTreeValidationError('putMany: entries not in ascending order.');
      }
      if (strictlyAscending && cmp === 0) {
        throw new BTreeValidationError(
          duplicateKeys === 'reject'
            ? 'putMany: duplicate key rejected.'
            : 'putMany: equal keys not allowed in strict mode.',
        );
      }
    }
    if (duplicateKeys === 'reject') {
      for (const entry of entries) {
        if (tree.hasKey(entry.key)) {
          throw new BTreeValidationError('Duplicate key rejected.');
        }
      }
    }
    return { type: 'putMany', entries };
  };
};

export const createDeleteRangeEvaluator = <TKey, TValue>(
  startKey: TKey,
  endKey: TKey,
  options: RangeBounds | undefined,
): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'deleteRange'; startKey: TKey; endKey: TKey; options?: RangeBounds } | null) => {
  return (tree): { type: 'deleteRange'; startKey: TKey; endKey: TKey; options?: RangeBounds } | null => {
    const count = tree.count(startKey, endKey, options);
    if (count === 0) {
      return null;
    }
    return { type: 'deleteRange', startKey, endKey, options };
  };
};

export const createClearEvaluator = <TKey, TValue>(): ((tree: InMemoryBTree<TKey, TValue>) => { type: 'clear' }) => {
  return (): { type: 'clear' } => ({ type: 'clear' });
};
