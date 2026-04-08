import { BTreeConcurrencyError } from '../errors.js';
import type { SharedTreeLog } from './types.js';

export const validateSyncLog = <TKey, TValue>(
  log: SharedTreeLog<TKey, TValue>,
  maxSyncMutationsPerBatch: number,
): void => {
  if (typeof log.version !== 'bigint') {
    throw new BTreeConcurrencyError('Store contract: version must be bigint.');
  }
  if (!Array.isArray(log.mutations)) {
    throw new BTreeConcurrencyError(
      'Store contract: mutations must be an array.',
    );
  }
  if (log.mutations.length > maxSyncMutationsPerBatch) {
    throw new BTreeConcurrencyError(
      `Sync batch exceeded limit (${String(maxSyncMutationsPerBatch)}).`,
    );
  }
};
