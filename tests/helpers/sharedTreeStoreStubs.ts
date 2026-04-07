import {
  type BTreeMutation,
  type SharedTreeLog,
  type SharedTreeStore,
} from '../../src/index.js';

export class AtomicMemorySharedTreeStore<TKey, TValue>
  implements SharedTreeStore<TKey, TValue>
{
  private versions: { version: bigint; mutations: BTreeMutation<TKey, TValue>[] }[];

  public constructor() {
    this.versions = [{ version: 0n, mutations: [] }];
  }

  public get currentVersion(): bigint {
    return this.versions[this.versions.length - 1].version;
  }

  public getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (version >= latestVersion) {
      return Promise.resolve({ version: latestVersion, mutations: [] });
    }

    const mutationsAfter: BTreeMutation<TKey, TValue>[] = [];
    for (const entry of this.versions) {
      if (entry.version > version) {
        mutationsAfter.push(...entry.mutations);
      }
    }

    return Promise.resolve({
      version: latestVersion,
      mutations: structuredClone(mutationsAfter),
    });
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (latestVersion !== expectedVersion) {
      return Promise.resolve({ applied: false, version: latestVersion });
    }

    this.versions.push({
      version: latestVersion + 1n,
      mutations: structuredClone(mutations),
    });
    return Promise.resolve({ applied: true, version: latestVersion + 1n });
  }
}

export class FailOnceCompareAndSetStore<TKey, TValue>
  implements SharedTreeStore<TKey, TValue>
{
  private readonly delegate: AtomicMemorySharedTreeStore<TKey, TValue>;
  private shouldFail = true;

  public constructor(delegate: AtomicMemorySharedTreeStore<TKey, TValue>) {
    this.delegate = delegate;
  }

  public getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    return this.delegate.getLogEntriesSince(version);
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    if (this.shouldFail) {
      this.shouldFail = false;
      return this.delegate.getLogEntriesSince(expectedVersion).then((log) => {
        return { applied: false, version: log.version };
      });
    }

    return this.delegate.append(expectedVersion, mutations);
  }
}

export class AlwaysConflictStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  public getLogEntriesSince(): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 0n,
      mutations: [],
    });
  }

  public append(expectedVersion: bigint, _mutations: BTreeMutation<TKey, TValue>[]): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: expectedVersion });
  }
}

export class DelayFirstReadStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  private readonly delegate: AtomicMemorySharedTreeStore<TKey, TValue>;
  private firstReadBlocked = true;
  private firstReadEnteredResolver: (() => void) | null = null;
  private readonly firstReadEntered: Promise<void>;
  private releaseFirstReadResolver: (() => void) | null = null;
  private readonly releaseFirstRead: Promise<void>;

  public constructor(delegate: AtomicMemorySharedTreeStore<TKey, TValue>) {
    this.delegate = delegate;
    this.firstReadEntered = new Promise<void>((resolve: () => void): void => {
      this.firstReadEnteredResolver = resolve;
    });
    this.releaseFirstRead = new Promise<void>((resolve: () => void): void => {
      this.releaseFirstReadResolver = resolve;
    });
  }

  public async getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    if (this.firstReadBlocked) {
      this.firstReadBlocked = false;
      this.firstReadEnteredResolver?.();
      await this.releaseFirstRead;
    }

    return this.delegate.getLogEntriesSince(version);
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    return this.delegate.append(expectedVersion, mutations);
  }

  public waitUntilFirstReadBlocked(): Promise<void> {
    return this.firstReadEntered;
  }

  public unblockFirstRead(): void {
    this.releaseFirstReadResolver?.();
  }
}

export class DelayFirstSuccessfulAppendStore<TKey, TValue>
  implements SharedTreeStore<TKey, TValue>
{
  private readonly delegate: AtomicMemorySharedTreeStore<TKey, TValue>;
  private firstAppendBlocked = true;
  private firstAppendEnteredResolver: (() => void) | null = null;
  private readonly firstAppendEntered: Promise<void>;
  private releaseFirstAppendResolver: (() => void) | null = null;
  private readonly releaseFirstAppend: Promise<void>;

  public constructor(delegate: AtomicMemorySharedTreeStore<TKey, TValue>) {
    this.delegate = delegate;
    this.firstAppendEntered = new Promise<void>((resolve: () => void): void => {
      this.firstAppendEnteredResolver = resolve;
    });
    this.releaseFirstAppend = new Promise<void>((resolve: () => void): void => {
      this.releaseFirstAppendResolver = resolve;
    });
  }

  public getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    return this.delegate.getLogEntriesSince(version);
  }

  public async append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    const result = await this.delegate.append(expectedVersion, mutations);
    if (result.applied && this.firstAppendBlocked) {
      this.firstAppendBlocked = false;
      this.firstAppendEnteredResolver?.();
      await this.releaseFirstAppend;
    }
    return result;
  }

  public waitUntilFirstAppendBlocked(): Promise<void> {
    return this.firstAppendEntered;
  }

  public unblockFirstAppend(): void {
    this.releaseFirstAppendResolver?.();
  }
}

export class JumpVersionStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  private version = 0n;
  private readonly mutations: BTreeMutation<TKey, TValue>[] = [];

  public getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    const unseen = version < this.version ? this.mutations : [];
    return Promise.resolve({ version: this.version, mutations: structuredClone(unseen) });
  }

  public append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    if (expectedVersion !== this.version) {
      return Promise.resolve({ applied: false, version: this.version });
    }

    this.mutations.push(...structuredClone(mutations));
    this.version += 10n;
    return Promise.resolve({ applied: true, version: this.version });
  }
}

export class UnknownMutationStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  public getLogEntriesSince(_version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 1n,
      mutations: [{ type: 'corrupt' } as unknown as BTreeMutation<TKey, TValue>],
    });
  }

  public append(_expectedVersion: bigint, _mutations: BTreeMutation<TKey, TValue>[]): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class CustomMutationStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  private readonly mutations: BTreeMutation<TKey, TValue>[];

  public constructor(mutations: BTreeMutation<TKey, TValue>[]) {
    this.mutations = mutations;
  }

  public getLogEntriesSince(_version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({ version: 1n, mutations: this.mutations });
  }

  public append(_expectedVersion: bigint, _mutations: BTreeMutation<TKey, TValue>[]): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class PartialBadBatchStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  public getLogEntriesSince(_version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
    return Promise.resolve({
      version: 1n,
      mutations: [
        { type: 'put', key: 1 as unknown as TKey, value: 'one' as unknown as TValue },
        { type: 'corrupt' } as unknown as BTreeMutation<TKey, TValue>,
      ],
    });
  }

  public append(_expectedVersion: bigint, _mutations: BTreeMutation<TKey, TValue>[]): Promise<{ applied: boolean; version: bigint }> {
    return Promise.resolve({ applied: false, version: 1n });
  }
}

export class NonReplayingAppendStore<TKey, TValue> implements SharedTreeStore<TKey, TValue> {
  private version = 0n;

  public getLogEntriesSince(_version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
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

export class AppliedWithoutVersionAdvanceStore<TKey, TValue>
  implements SharedTreeStore<TKey, TValue>
{
  private version = 0n;

  public getLogEntriesSince(_version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
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

export class RegressedConflictVersionStore<TKey, TValue>
  implements SharedTreeStore<TKey, TValue>
{
  private version = 0n;
  private readonly mutations: BTreeMutation<TKey, TValue>[] = [];

  public getLogEntriesSince(version: bigint): Promise<SharedTreeLog<TKey, TValue>> {
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
