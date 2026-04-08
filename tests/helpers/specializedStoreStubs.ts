import {
  type BTreeMutation,
  type EntryId,
  type SharedTreeLog,
  type SharedTreeStore,
} from '../../src/index.js';

export class AlwaysConflictStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  public getLogEntriesSince(): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 0n,
      mutations: [],
    });
  }

  public append(
    expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: expectedVersion });
  }
}

export class UnknownMutationStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 1n,
      mutations: [
        { type: 'corrupt' } as unknown as BTreeMutation<TKey, TValue>,
      ],
    });
  }

  public append(
    _expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class CustomMutationStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  private readonly mutations: BTreeMutation<TKey, TValue>[];

  public constructor(mutations: BTreeMutation<TKey, TValue>[]) {
    this.mutations = mutations;
  }

  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({ version: 1n, mutations: this.mutations });
  }

  public append(
    _expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class PartialBadBatchStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 1n,
      mutations: [
        {
          type: 'put',
          key: 1 as unknown as TKey,
          value: 'one' as unknown as TValue,
        },
        { type: 'corrupt' } as unknown as BTreeMutation<TKey, TValue>,
      ],
    });
  }

  public append(
    _expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class NonReplayingAppendStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  private version = 0n;

  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({ version: this.version, mutations: [] });
  }

  public append(
    expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    if (expectedVersion !== this.version) {
      return Promise.resolve({ applied: false, version: this.version });
    }
    this.version += 1n;
    return Promise.resolve({ applied: true, version: this.version });
  }
}

export class AppliedWithoutVersionAdvanceStore<
  TKey,
  TValue,
> implements SharedTreeStore<TKey, TValue> {
  private version = 0n;

  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({ version: this.version, mutations: [] });
  }

  public append(
    expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    if (expectedVersion !== this.version) {
      return Promise.resolve({ applied: false, version: this.version });
    }
    return Promise.resolve({ applied: true, version: expectedVersion });
  }
}

export class RegressedConflictVersionStore<
  TKey,
  TValue,
> implements SharedTreeStore<TKey, TValue> {
  private version = 0n;
  private readonly mutations: BTreeMutation<TKey, TValue>[] = [];

  public getLogEntriesSince(
    version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    const unseen = version < this.version ? this.mutations : [];
    return Promise.resolve({
      version: this.version,
      mutations: structuredClone(unseen),
    });
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    if (expectedVersion !== this.version) {
      return Promise.resolve({ applied: false, version: this.version });
    }

    if (this.version === 0n) {
      this.mutations.push(...structuredClone(mutations));
      this.version = 1n;
      return Promise.resolve({ applied: true, version: this.version });
    }

    return Promise.resolve({ applied: false, version: this.version - 1n });
  }
}

/**
 * Returns a batch that passes structural validation but contains a `removeById`
 * mutation that will throw at runtime when `enableEntryIdLookup` is false.
 * Used to test partial-apply protection and instance corruption semantics.
 */
export class IncompatibleReplayStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  public getLogEntriesSince(
    _version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 1n,
      mutations: [
        {
          type: 'put',
          key: 1 as unknown as TKey,
          value: 'one' as unknown as TValue,
        },
        { type: 'removeById', entryId: 999 as unknown as EntryId },
      ],
    });
  }

  public append(
    _expectedVersion: bigint,
    _mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}
