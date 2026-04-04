import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { hrtime } from 'node:process';

const INPUT_SIZES = [1024, 4096, 16384, 65536];
const WARMUP_ROUNDS = 1;
const MEASURE_ROUNDS = 4;
const MIN_HEAD_ACCESS_ITERATIONS = 200000;
const MIN_EXISTS_POINT_QUERIES = 100000;
const MIN_SELECT_POINT_QUERIES = 100000;
const MIN_SELECT_WINDOW_QUERIES = 30000;
const MIN_GET_POINT_QUERIES = 100000;
const MIN_COUNT_RANGE_QUERIES = 30000;
const SELECT_WINDOW_SIZE = 64;
const DELETE_RANGE_WINDOW_SIZE = 64;
const CONCURRENT_BENCH_SIZE = 4096;

let sideEffectSink = 0;

const compareNumbers = (left, right) => left - right;

/** @type {any} */
let inMemoryBTreeClass = null;
/** @type {any} */
let concurrentBTreeClass = null;

const createTree = (configOverrides) => {
  if (inMemoryBTreeClass === null) {
    throw new Error(
      'benchmark runner failed to initialize InMemoryBTree class.',
    );
  }
  return new inMemoryBTreeClass({
    compareKeys: compareNumbers,
    ...configOverrides,
  });
};

const createPopulatedTree = (insertionOrder, configOverrides) => {
  const tree = createTree(configOverrides);
  for (const key of insertionOrder) {
    tree.put(key, key);
  }
  return tree;
};

const lcg = (seed) => {
  return (1664525 * seed + 1013904223) >>> 0;
};

const createShuffledSequence = (size, initialSeed) => {
  const values = Array.from({ length: size }, (_, index) => index);
  let seed = initialSeed >>> 0;

  for (let index = values.length - 1; index > 0; index -= 1) {
    seed = lcg(seed);
    const swapIndex = seed % (index + 1);
    const temporary = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = temporary;
  }

  return values;
};

const median = (values) => {
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }
  return sortedValues[middleIndex];
};

const nowNanoseconds = () => {
  return hrtime.bigint();
};

// ---------------------------------------------------------------------------
// InMemoryBTree benchmarks
// ---------------------------------------------------------------------------

const benchmarkInsert = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    createPopulatedTree(insertionOrder, configOverrides);
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const start = nowNanoseconds();
    createPopulatedTree(insertionOrder, configOverrides);
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkRemove = (
  size,
  insertionOrder,
  removalOrder,
  configOverrides,
) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    for (const key of removalOrder) {
      tree.remove(key);
    }
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);

    const start = nowNanoseconds();
    for (const key of removalOrder) {
      tree.remove(key);
    }
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));

    if (tree.size() !== 0) {
      throw new Error('remove benchmark must leave tree empty.');
    }
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkPopFirst = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    for (let index = 0; index < size; index += 1) {
      tree.popFirst();
    }
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);

    const start = nowNanoseconds();
    for (let index = 0; index < size; index += 1) {
      tree.popFirst();
    }
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));

    if (tree.size() !== 0) {
      throw new Error('pop-first benchmark must leave tree empty.');
    }
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkPopLast = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    for (let index = 0; index < size; index += 1) {
      tree.popLast();
    }
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);

    const start = nowNanoseconds();
    for (let index = 0; index < size; index += 1) {
      tree.popLast();
    }
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));

    if (tree.size() !== 0) {
      throw new Error('pop-last benchmark must leave tree empty.');
    }
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkHeadAccess = (size, insertionOrder, configOverrides) => {
  const iterations = Math.max(MIN_HEAD_ACCESS_ITERATIONS, size * 8);

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const first = tree.peekFirst();
      if (first === null) {
        throw new Error('head-access benchmark requires non-empty tree.');
      }
      checksum ^= first.key;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);

    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < iterations; index += 1) {
      const first = tree.peekFirst();
      if (first === null) {
        throw new Error('head-access benchmark requires non-empty tree.');
      }
      checksum ^= first.key;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: iterations,
  };
};

const benchmarkExistsPoint = (size, insertionOrder, configOverrides) => {
  const queries = Math.max(MIN_EXISTS_POINT_QUERIES, size * 8);
  const pointOrder = createShuffledSequence(size, 0x2b79c1 + size);

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const exists = tree.hasKey(point);
      if (!exists) {
        throw new Error('exists-point benchmark requires key presence.');
      }
      checksum ^= point;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const exists = tree.hasKey(point);
      if (!exists) {
        throw new Error('exists-point benchmark requires key presence.');
      }
      checksum ^= point;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

const benchmarkGetPoint = (size, insertionOrder, configOverrides) => {
  const queries = Math.max(MIN_GET_POINT_QUERIES, size * 8);
  const pointOrder = createShuffledSequence(size, 0x3c82a1 + size);

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const value = tree.get(point);
      if (value === null) {
        throw new Error('get-point benchmark requires key presence.');
      }
      checksum ^= value;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const value = tree.get(point);
      if (value === null) {
        throw new Error('get-point benchmark requires key presence.');
      }
      checksum ^= value;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

const benchmarkSelectPoint = (size, insertionOrder, configOverrides) => {
  const queries = Math.max(MIN_SELECT_POINT_QUERIES, size * 8);
  const pointOrder = createShuffledSequence(size, 0x4a51d2 + size);

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const entries = tree.range(point, point);
      if (entries.length !== 1) {
        throw new Error(
          'select-point benchmark requires exactly one matching entry.',
        );
      }
      checksum ^= entries[0].value;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const entries = tree.range(point, point);
      if (entries.length !== 1) {
        throw new Error(
          'select-point benchmark requires exactly one matching entry.',
        );
      }
      checksum ^= entries[0].value;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

const benchmarkSelectWindow = (size, insertionOrder, configOverrides) => {
  const queries = Math.max(MIN_SELECT_WINDOW_QUERIES, size * 2);
  const maxStartKeyExclusive = size - SELECT_WINDOW_SIZE + 1;
  const windowStartOrder = createShuffledSequence(
    maxStartKeyExclusive,
    0x7cc251 + size,
  );

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const startKey = windowStartOrder[index % windowStartOrder.length];
      const endKey = startKey + SELECT_WINDOW_SIZE - 1;
      const entries = tree.range(startKey, endKey);
      if (entries.length !== SELECT_WINDOW_SIZE) {
        throw new Error(
          'select-window benchmark requires fixed window result size.',
        );
      }
      checksum ^= entries.length;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const startKey = windowStartOrder[index % windowStartOrder.length];
      const endKey = startKey + SELECT_WINDOW_SIZE - 1;
      const entries = tree.range(startKey, endKey);
      if (entries.length !== SELECT_WINDOW_SIZE) {
        throw new Error(
          'select-window benchmark requires fixed window result size.',
        );
      }
      checksum ^= entries.length;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

const benchmarkCountRange = (size, insertionOrder, configOverrides) => {
  const queries = Math.max(MIN_COUNT_RANGE_QUERIES, size * 2);
  const maxStartKeyExclusive = size - SELECT_WINDOW_SIZE + 1;
  const windowStartOrder = createShuffledSequence(
    maxStartKeyExclusive,
    0x5da312 + size,
  );

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const startKey = windowStartOrder[index % windowStartOrder.length];
      const endKey = startKey + SELECT_WINDOW_SIZE - 1;
      const count = tree.count(startKey, endKey);
      if (count !== SELECT_WINDOW_SIZE) {
        throw new Error(
          'count-range benchmark requires fixed window result size.',
        );
      }
      checksum ^= count;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const startKey = windowStartOrder[index % windowStartOrder.length];
      const endKey = startKey + SELECT_WINDOW_SIZE - 1;
      const count = tree.count(startKey, endKey);
      if (count !== SELECT_WINDOW_SIZE) {
        throw new Error(
          'count-range benchmark requires fixed window result size.',
        );
      }
      checksum ^= count;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

const benchmarkDeleteRange = (size, insertionOrder, configOverrides) => {
  const windowCount = Math.floor(size / DELETE_RANGE_WINDOW_SIZE);

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    for (let w = 0; w < windowCount; w += 1) {
      const startKey = w * DELETE_RANGE_WINDOW_SIZE;
      const endKey = startKey + DELETE_RANGE_WINDOW_SIZE - 1;
      tree.deleteRange(startKey, endKey);
    }
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);

    const start = nowNanoseconds();
    for (let w = 0; w < windowCount; w += 1) {
      const startKey = w * DELETE_RANGE_WINDOW_SIZE;
      const endKey = startKey + DELETE_RANGE_WINDOW_SIZE - 1;
      tree.deleteRange(startKey, endKey);
    }
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: windowCount,
  };
};

const benchmarkInsertManyEmpty = (size, configOverrides) => {
  const sortedEntries = Array.from({ length: size }, (_, index) => ({
    key: index,
    value: index,
  }));

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createTree(configOverrides);
    tree.putMany(sortedEntries);
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createTree(configOverrides);
    const start = nowNanoseconds();
    tree.putMany(sortedEntries);
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkInsertManyPopulated = (
  size,
  insertionOrder,
  configOverrides,
) => {
  const additionalEntries = Array.from({ length: size }, (_, index) => ({
    key: size + index,
    value: size + index,
  }));

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    tree.putMany(additionalEntries);
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    const start = nowNanoseconds();
    tree.putMany(additionalEntries);
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkEntries = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (const entry of tree.entries()) {
      checksum ^= entry.key;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (const entry of tree.entries()) {
      checksum ^= entry.key;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkEntriesReversed = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    for (const entry of tree.entriesReversed()) {
      checksum ^= entry.key;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    let checksum = 0;
    const start = nowNanoseconds();
    for (const entry of tree.entriesReversed()) {
      checksum ^= entry.key;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkClone = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    const cloned = tree.clone();
    sideEffectSink ^= cloned.size();
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    const start = nowNanoseconds();
    const cloned = tree.clone();
    const end = nowNanoseconds();
    sideEffectSink ^= cloned.size();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkSerialize = (size, insertionOrder, configOverrides) => {
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    const json = tree.toJSON();
    const restored = inMemoryBTreeClass.fromJSON(json, compareNumbers);
    sideEffectSink ^= restored.size();
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = createPopulatedTree(insertionOrder, configOverrides);
    const start = nowNanoseconds();
    const json = tree.toJSON();
    const restored = inMemoryBTreeClass.fromJSON(json, compareNumbers);
    const end = nowNanoseconds();
    sideEffectSink ^= restored.size();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

// ---------------------------------------------------------------------------
// ConcurrentInMemoryBTree benchmark helpers
// ---------------------------------------------------------------------------

const createInProcessStore = () => {
  let currentVersion = 0n;
  const allMutations = [];

  return {
    async getLogEntriesSince(version) {
      const startIndex = Number(version);
      return {
        version: currentVersion,
        mutations: allMutations.slice(startIndex),
      };
    },
    async append(expectedVersion, mutations) {
      if (expectedVersion !== currentVersion) {
        return { applied: false, version: currentVersion };
      }
      allMutations.push(...mutations);
      currentVersion += BigInt(mutations.length);
      return { applied: true, version: currentVersion };
    },
  };
};

const benchmarkConcurrentInsert = async (size, insertionOrder) => {
  if (concurrentBTreeClass === null) {
    return null;
  }

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const store = createInProcessStore();
    const tree = new concurrentBTreeClass({
      compareKeys: compareNumbers,
      store,
    });
    for (const key of insertionOrder) {
      await tree.put(key, key);
    }
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const store = createInProcessStore();
    const tree = new concurrentBTreeClass({
      compareKeys: compareNumbers,
      store,
    });

    const start = nowNanoseconds();
    for (const key of insertionOrder) {
      await tree.put(key, key);
    }
    const end = nowNanoseconds();
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: size,
  };
};

const benchmarkConcurrentGet = async (size, insertionOrder) => {
  if (concurrentBTreeClass === null) {
    return null;
  }

  const queries = Math.max(MIN_GET_POINT_QUERIES, size * 8);
  const pointOrder = createShuffledSequence(size, 0x9e12c4 + size);

  const prepareTree = async () => {
    const store = createInProcessStore();
    const tree = new concurrentBTreeClass({
      compareKeys: compareNumbers,
      store,
    });
    for (const key of insertionOrder) {
      await tree.put(key, key);
    }
    return tree;
  };

  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    const tree = await prepareTree();
    let checksum = 0;
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const value = await tree.get(point);
      if (value === null) {
        throw new Error('concurrent get benchmark requires key presence.');
      }
      checksum ^= value;
    }
    sideEffectSink ^= checksum;
  }

  const elapsedByRound = [];
  for (let round = 0; round < MEASURE_ROUNDS; round += 1) {
    const tree = await prepareTree();
    let checksum = 0;
    const start = nowNanoseconds();
    for (let index = 0; index < queries; index += 1) {
      const point = pointOrder[index % pointOrder.length];
      const value = await tree.get(point);
      if (value === null) {
        throw new Error('concurrent get benchmark requires key presence.');
      }
      checksum ^= value;
    }
    const end = nowNanoseconds();
    sideEffectSink ^= checksum;
    elapsedByRound.push(Number(end - start));
  }

  const elapsedNs = median(elapsedByRound);
  return {
    elapsedNs,
    operationCount: queries,
  };
};

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const formatNumber = (value, fractionDigits) => {
  return value.toFixed(fractionDigits);
};

const formatRow = (cells, widths) => {
  return cells
    .map((cell, index) => {
      const width = widths[index] ?? 12;
      return cell.padStart(width);
    })
    .join(' ');
};

const DEFAULT_WIDTHS = [18, 8, 14, 14, 16, 12];
const VARIANT_WIDTHS = [14, 18, 8, 14, 14, 16, 12];

const printDefaultHeader = () => {
  console.log(
    formatRow(
      ['operation', 'N', 'median-ms', 'ns/op', 'normalized', 'ratio'],
      DEFAULT_WIDTHS,
    ),
  );
  console.log(
    formatRow(
      ['---------', '---', '---------', '-----', '----------', '-----'],
      DEFAULT_WIDTHS,
    ),
  );
};

const printVariantHeader = () => {
  console.log(
    formatRow(
      ['config', 'operation', 'N', 'median-ms', 'ns/op', 'normalized', 'ratio'],
      VARIANT_WIDTHS,
    ),
  );
  console.log(
    formatRow(
      [
        '------',
        '---------',
        '---',
        '---------',
        '-----',
        '----------',
        '-----',
      ],
      VARIANT_WIDTHS,
    ),
  );
};

const CONSTANT_TIME_OPS = new Set([
  'head-access',
  'put-many-empty',
  'entries',
  'entries-rev',
  'clone',
  'serialize',
]);

const printRows = (rows, baselineByOperation, widths, configLabel) => {
  for (const row of rows) {
    const nsPerOp = row.elapsedNs / row.operationCount;
    const baseline = baselineByOperation.get(row.operation);
    const ratio = baseline === undefined ? 1 : row.normalized / baseline;
    const isConstantTimeOp = CONSTANT_TIME_OPS.has(row.operation);
    const normalizedLabel = isConstantTimeOp
      ? `${formatNumber(row.normalized, 2)}ns`
      : `${formatNumber(row.normalized, 2)}ns/log2N`;

    const cells =
      configLabel !== undefined
        ? [
            configLabel,
            row.operation,
            String(row.size),
            formatNumber(row.elapsedNs / 1e6, 3),
            formatNumber(nsPerOp, 2),
            normalizedLabel,
            formatNumber(ratio, 2),
          ]
        : [
            row.operation,
            String(row.size),
            formatNumber(row.elapsedNs / 1e6, 3),
            formatNumber(nsPerOp, 2),
            normalizedLabel,
            formatNumber(ratio, 2),
          ];

    console.log(formatRow(cells, widths));
  }
};

// ---------------------------------------------------------------------------
// Helpers for collecting benchmark results
// ---------------------------------------------------------------------------

const collectTypeScriptFiles = async (directoryPath) => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectTypeScriptFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
};

const assertDistExistsAndFresh = async () => {
  const distPath = path.resolve(process.cwd(), 'dist', 'index.js');
  const srcPath = path.resolve(process.cwd(), 'src');

  let distStats;
  try {
    await access(distPath);
    distStats = await stat(distPath);
  } catch {
    throw new Error(
      'dist/index.js not found. Run `pnpm build` before `pnpm bench`.',
    );
  }

  const sourceFiles = await collectTypeScriptFiles(srcPath);
  let latestSourceMtimeMs = 0;

  for (const sourceFile of sourceFiles) {
    const sourceStats = await stat(sourceFile);
    if (sourceStats.mtimeMs > latestSourceMtimeMs) {
      latestSourceMtimeMs = sourceStats.mtimeMs;
    }
  }

  if (latestSourceMtimeMs > distStats.mtimeMs) {
    throw new Error(
      'src/ contains files newer than dist/index.js. Run `pnpm build` before `pnpm bench`.',
    );
  }
};

const computeBaselines = (rows) => {
  const baselineByOperation = new Map();
  for (const row of rows) {
    if (!baselineByOperation.has(row.operation)) {
      baselineByOperation.set(row.operation, row.normalized);
    }
  }
  return baselineByOperation;
};

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

const runDefaultBenchmarks = () => {
  const rows = [];
  for (const size of INPUT_SIZES) {
    const insertionOrder = createShuffledSequence(size, 0x81a5c3 + size);
    const removalOrder = createShuffledSequence(size, 0x21fd73 + size);

    const insertResult = benchmarkInsert(size, insertionOrder);
    const removeResult = benchmarkRemove(size, insertionOrder, removalOrder);
    const popFirstResult = benchmarkPopFirst(size, insertionOrder);
    const popLastResult = benchmarkPopLast(size, insertionOrder);
    const headResult = benchmarkHeadAccess(size, insertionOrder);
    const existsPointResult = benchmarkExistsPoint(size, insertionOrder);
    const getPointResult = benchmarkGetPoint(size, insertionOrder);
    const selectPointResult = benchmarkSelectPoint(size, insertionOrder);
    const selectWindowResult = benchmarkSelectWindow(size, insertionOrder);
    const countRangeResult = benchmarkCountRange(size, insertionOrder);
    const deleteRangeResult = benchmarkDeleteRange(size, insertionOrder);
    const insertManyEmptyResult = benchmarkInsertManyEmpty(size);
    const insertManyPopulatedResult = benchmarkInsertManyPopulated(
      size,
      insertionOrder,
    );
    const entriesResult = benchmarkEntries(size, insertionOrder);
    const entriesReversedResult = benchmarkEntriesReversed(
      size,
      insertionOrder,
    );
    const cloneResult = benchmarkClone(size, insertionOrder);
    const serializeResult = benchmarkSerialize(size, insertionOrder);

    rows.push({
      operation: 'put',
      size,
      elapsedNs: insertResult.elapsedNs,
      operationCount: insertResult.operationCount,
      normalized:
        insertResult.elapsedNs / insertResult.operationCount / Math.log2(size),
    });
    rows.push({
      operation: 'remove',
      size,
      elapsedNs: removeResult.elapsedNs,
      operationCount: removeResult.operationCount,
      normalized:
        removeResult.elapsedNs / removeResult.operationCount / Math.log2(size),
    });
    rows.push({
      operation: 'pop-first',
      size,
      elapsedNs: popFirstResult.elapsedNs,
      operationCount: popFirstResult.operationCount,
      normalized:
        popFirstResult.elapsedNs /
        popFirstResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'pop-last',
      size,
      elapsedNs: popLastResult.elapsedNs,
      operationCount: popLastResult.operationCount,
      normalized:
        popLastResult.elapsedNs /
        popLastResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'head-access',
      size,
      elapsedNs: headResult.elapsedNs,
      operationCount: headResult.operationCount,
      normalized: headResult.elapsedNs / headResult.operationCount,
    });
    rows.push({
      operation: 'exists-point',
      size,
      elapsedNs: existsPointResult.elapsedNs,
      operationCount: existsPointResult.operationCount,
      normalized:
        existsPointResult.elapsedNs /
        existsPointResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'get-point',
      size,
      elapsedNs: getPointResult.elapsedNs,
      operationCount: getPointResult.operationCount,
      normalized:
        getPointResult.elapsedNs /
        getPointResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'select-point',
      size,
      elapsedNs: selectPointResult.elapsedNs,
      operationCount: selectPointResult.operationCount,
      normalized:
        selectPointResult.elapsedNs /
        selectPointResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'select-window',
      size,
      elapsedNs: selectWindowResult.elapsedNs,
      operationCount: selectWindowResult.operationCount,
      normalized:
        selectWindowResult.elapsedNs /
        selectWindowResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'count-range',
      size,
      elapsedNs: countRangeResult.elapsedNs,
      operationCount: countRangeResult.operationCount,
      normalized:
        countRangeResult.elapsedNs /
        countRangeResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'delete-range',
      size,
      elapsedNs: deleteRangeResult.elapsedNs,
      operationCount: deleteRangeResult.operationCount,
      normalized:
        deleteRangeResult.elapsedNs /
        deleteRangeResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'put-many-empty',
      size,
      elapsedNs: insertManyEmptyResult.elapsedNs,
      operationCount: insertManyEmptyResult.operationCount,
      normalized:
        insertManyEmptyResult.elapsedNs / insertManyEmptyResult.operationCount,
    });
    rows.push({
      operation: 'put-many-pop',
      size,
      elapsedNs: insertManyPopulatedResult.elapsedNs,
      operationCount: insertManyPopulatedResult.operationCount,
      normalized:
        insertManyPopulatedResult.elapsedNs /
        insertManyPopulatedResult.operationCount /
        Math.log2(size),
    });
    rows.push({
      operation: 'entries',
      size,
      elapsedNs: entriesResult.elapsedNs,
      operationCount: entriesResult.operationCount,
      normalized: entriesResult.elapsedNs / entriesResult.operationCount,
    });
    rows.push({
      operation: 'entries-rev',
      size,
      elapsedNs: entriesReversedResult.elapsedNs,
      operationCount: entriesReversedResult.operationCount,
      normalized:
        entriesReversedResult.elapsedNs / entriesReversedResult.operationCount,
    });
    rows.push({
      operation: 'clone',
      size,
      elapsedNs: cloneResult.elapsedNs,
      operationCount: cloneResult.operationCount,
      normalized: cloneResult.elapsedNs / cloneResult.operationCount,
    });
    rows.push({
      operation: 'serialize',
      size,
      elapsedNs: serializeResult.elapsedNs,
      operationCount: serializeResult.operationCount,
      normalized: serializeResult.elapsedNs / serializeResult.operationCount,
    });
  }

  return rows;
};

const VARIANT_CORE_OPS = ['put', 'remove', 'exists-point', 'select-point'];

const runVariantBenchmarks = () => {
  const configs = [
    { label: 'dup-allow', overrides: { duplicateKeys: 'allow' } },
    { label: 'auto-scale', overrides: { autoScale: true } },
  ];

  const rows = [];
  for (const { label, overrides } of configs) {
    for (const size of INPUT_SIZES) {
      const insertionOrder = createShuffledSequence(size, 0x81a5c3 + size);
      const removalOrder = createShuffledSequence(size, 0x21fd73 + size);

      const insertResult = benchmarkInsert(size, insertionOrder, overrides);
      rows.push({
        config: label,
        operation: 'put',
        size,
        elapsedNs: insertResult.elapsedNs,
        operationCount: insertResult.operationCount,
        normalized:
          insertResult.elapsedNs /
          insertResult.operationCount /
          Math.log2(size),
      });

      const removeResult = benchmarkRemove(
        size,
        insertionOrder,
        removalOrder,
        overrides,
      );
      rows.push({
        config: label,
        operation: 'remove',
        size,
        elapsedNs: removeResult.elapsedNs,
        operationCount: removeResult.operationCount,
        normalized:
          removeResult.elapsedNs /
          removeResult.operationCount /
          Math.log2(size),
      });

      const existsResult = benchmarkExistsPoint(
        size,
        insertionOrder,
        overrides,
      );
      rows.push({
        config: label,
        operation: 'exists-point',
        size,
        elapsedNs: existsResult.elapsedNs,
        operationCount: existsResult.operationCount,
        normalized:
          existsResult.elapsedNs /
          existsResult.operationCount /
          Math.log2(size),
      });

      const selectResult = benchmarkSelectPoint(
        size,
        insertionOrder,
        overrides,
      );
      rows.push({
        config: label,
        operation: 'select-point',
        size,
        elapsedNs: selectResult.elapsedNs,
        operationCount: selectResult.operationCount,
        normalized:
          selectResult.elapsedNs /
          selectResult.operationCount /
          Math.log2(size),
      });
    }
  }

  return rows;
};

const runConcurrentBenchmarks = async () => {
  if (concurrentBTreeClass === null) {
    return [];
  }

  const size = CONCURRENT_BENCH_SIZE;
  const insertionOrder = createShuffledSequence(size, 0x81a5c3 + size);

  const insertResult = await benchmarkConcurrentInsert(size, insertionOrder);
  const getResult = await benchmarkConcurrentGet(size, insertionOrder);

  const rows = [];
  if (insertResult !== null) {
    rows.push({
      operation: 'put',
      size,
      elapsedNs: insertResult.elapsedNs,
      operationCount: insertResult.operationCount,
      normalized:
        insertResult.elapsedNs / insertResult.operationCount / Math.log2(size),
    });
  }
  if (getResult !== null) {
    rows.push({
      operation: 'get',
      size,
      elapsedNs: getResult.elapsedNs,
      operationCount: getResult.operationCount,
      normalized:
        getResult.elapsedNs / getResult.operationCount / Math.log2(size),
    });
  }

  return rows;
};

const run = async () => {
  await assertDistExistsAndFresh();
  const distModule = await import('../dist/index.js');
  if (!('InMemoryBTree' in distModule)) {
    throw new Error('dist/index.js does not export InMemoryBTree.');
  }
  inMemoryBTreeClass = distModule.InMemoryBTree;

  if ('ConcurrentInMemoryBTree' in distModule) {
    concurrentBTreeClass = distModule.ConcurrentInMemoryBTree;
  }

  // --- Section 1: Default config ---
  console.log('=== InMemoryBTree (default config) ===');
  console.log();
  const defaultRows = runDefaultBenchmarks();
  const defaultBaselines = computeBaselines(defaultRows);
  printDefaultHeader();
  printRows(defaultRows, defaultBaselines, DEFAULT_WIDTHS);

  // --- Section 2: Config variants ---
  console.log();
  console.log('=== InMemoryBTree (config variants) ===');
  console.log();
  const variantRows = runVariantBenchmarks();
  const variantBaselines = new Map();
  for (const row of variantRows) {
    const key = `${row.config}:${row.operation}`;
    if (!variantBaselines.has(key)) {
      variantBaselines.set(key, row.normalized);
    }
  }
  printVariantHeader();
  for (const row of variantRows) {
    const key = `${row.config}:${row.operation}`;
    const baseline = variantBaselines.get(key);
    const ratio = baseline === undefined ? 1 : row.normalized / baseline;
    const nsPerOp = row.elapsedNs / row.operationCount;
    const normalizedLabel = `${formatNumber(row.normalized, 2)}ns/log2N`;

    console.log(
      formatRow(
        [
          row.config,
          row.operation,
          String(row.size),
          formatNumber(row.elapsedNs / 1e6, 3),
          formatNumber(nsPerOp, 2),
          normalizedLabel,
          formatNumber(ratio, 2),
        ],
        VARIANT_WIDTHS,
      ),
    );
  }

  // --- Section 3: ConcurrentInMemoryBTree ---
  console.log();
  console.log('=== ConcurrentInMemoryBTree ===');
  console.log();
  const concurrentRows = await runConcurrentBenchmarks();
  if (concurrentRows.length === 0) {
    console.log('(skipped — ConcurrentInMemoryBTree not found in dist)');
  } else {
    const concurrentBaselines = computeBaselines(concurrentRows);
    printDefaultHeader();
    printRows(concurrentRows, concurrentBaselines, DEFAULT_WIDTHS);
  }

  if (sideEffectSink === Number.MIN_SAFE_INTEGER) {
    console.error('unreachable branch for side-effect sink');
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
