# frostpillar-btree

[English/英語](./README.md) | [Japanese/日本語](./README-JA.md)

[![npm version](https://img.shields.io/npm/v/@frostpillar/frostpillar-btree)](https://www.npmjs.com/package/@frostpillar/frostpillar-btree)
[![Node.js >=24](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](https://nodejs.org/)
[![CI](https://github.com/hjmsano/frostpillar-btree/actions/workflows/ci.yml/badge.svg)](https://github.com/hjmsano/frostpillar-btree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[B+ tree](https://en.wikipedia.org/wiki/B%2B_tree) は、データをソート済みに保ち、検索・挿入・削除を O(log n) で実行できる自己平衡木データ構造です。ソート済み配列と異なり、頻繁な挿入・削除を再ソートなしで効率的に処理します。

`frostpillar-btree` は TypeScript、Node.js、およびブラウザ（JavaScript）で動作する、依存関係ゼロの軽量なインメモリ B+ tree ライブラリです。タスクキュー、優先度リスト、リーダーボード、高速な順序付きアクセスが必要なあらゆる場面でソート済みキーバリューストアとして利用できます。プラガブルな共有ストアを介した複数プロセス間の状態協調もサポートしています。

## 特徴

- **依存関係ゼロ** -- ランタイムパッケージ不要
- **どこでも動作** -- Node.js（ESM および CJS）、TypeScript、ブラウザ（IIFE バンドル）
- **ブラウザ向け 2 種類のバンドル** -- フル API と単一プロセス向けコアバンドル
- **キー一意性ポリシー** -- `'replace'`（デフォルト、マップ）、`'reject'`（一意制約）、`'allow'`（マルチマップ）を選択可能
- **厳格な TypeScript 型** -- ブランド型 `EntryId` による型安全なジェネリクス
- **プロセス間協調** -- `ConcurrentInMemoryBTree` がプラガブルな共有ストアによる楽観的並行制御を提供

## 簡単な例

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
});

const idTen = tree.put(10, 'ten');
tree.put(20, 'twenty');

console.log(tree.peekById(idTen));
console.log(tree.range(10, 20));
```

---

## 目次

- [はじめに](#はじめに)
- [ユーザーマニュアル](#ユーザーマニュアル)
  - [InMemoryBTree（単一プロセス）](#inmemorybtree単一プロセス)
  - [ConcurrentInMemoryBTree（マルチプロセス）](#concurrentinmemorybtreeマルチプロセス)
  - [エラーハンドリング](#エラーハンドリング)
- [API リファレンス](#api-リファレンス)
  - [InMemoryBTree](#inmemorybtree)
  - [ConcurrentInMemoryBTree](#concurrentinmemorybtree)
  - [エクスポートされる型](#エクスポートされる型)
- [コントリビュートガイド](#コントリビュートガイド)

---

## はじめに

### インストール（Node.js / TypeScript）

インストール方法は以下のとおりです。

```bash
npm install @frostpillar/frostpillar-btree
# または
pnpm add @frostpillar/frostpillar-btree
```

単一プロセス API だけが必要な場合は、core サブパスから import できます。

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree/core';
```

#### CommonJS

CommonJS もサポートしています。通常どおり `require()` で利用できます。

```js
const { InMemoryBTree } = require('@frostpillar/frostpillar-btree');
// または core サブパス:
const { InMemoryBTree } = require('@frostpillar/frostpillar-btree/core');
```

### インストール（ブラウザ）

minify 済みの IIFE バンドルは [GitHub Releases](https://github.com/hjmsano/frostpillar-btree/releases) から取得できます。どちらも ES2020 ターゲットです。

- `frostpillar-btree.min.js`（フル API）: `window.FrostpillarBTree`
- `frostpillar-btree-core.min.js`（単一プロセス向けコア）: `window.FrostpillarBTreeCore`

1. Releases から必要なバンドルをダウンロードします。
2. 静的配信ディレクトリに配置します。
3. `<script>` タグで読み込みます。

```html
<script src="./frostpillar-btree.min.js"></script>
<!-- または -->
<script src="./frostpillar-btree-core.min.js"></script>
```

読み込み後、対応するグローバルから利用できます。

```js
const { InMemoryBTree } = window.FrostpillarBTree;
// または:
// const { InMemoryBTree } = window.FrostpillarBTreeCore;
```

### 動作環境

| 環境       | 要件                                                         |
| ---------- | ------------------------------------------------------------ |
| Node.js    | >= 24.0.0（ESM および CJS）                                  |
| ブラウザ   | ES2020 対応（Chrome 80+、Firefox 74+、Safari 14+、Edge 80+） |
| TypeScript | >= 5.0                                                       |

---

## ユーザーマニュアル

> **エラー概要：** 操作は `BTreeValidationError`（不正なコンパレータや設定）、`BTreeInvariantError`（ツリー構造の破損）、`BTreeConcurrencyError`（並行リトライの枯渇）をスローする場合があります。詳細と例は[エラーハンドリング](#エラーハンドリング)を参照してください。

### InMemoryBTree（単一プロセス）

`InMemoryBTree` は単一プロセス向けのコアクラスです。キーバリューペアを B+ tree 構造で保持し、O(log n) の挿入・削除・検索を提供します。

#### ツリーの作成

ソート順を定義する `compareKeys` 関数が必要です。`Array.prototype.sort` と同じ規約に従います。`left < right` なら負の値、`left > right` なら正の値、等しければ `0` を返してください。

**Node.js / TypeScript：**

```ts
import { InMemoryBTree } from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
});
```

**ブラウザ：**

```js
const { InMemoryBTree } = window.FrostpillarBTree;

const tree = new InMemoryBTree({
  compareKeys: (left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  },
});
```

`maxLeafEntries` と `maxBranchChildren`（いずれもデフォルト 64、最小 3、最大 16384）でツリー構造をチューニングできます。

```ts
const tree = new InMemoryBTree<string, number>({
  compareKeys: (a, b) => a.localeCompare(b),
  maxLeafEntries: 128,
  maxBranchChildren: 128,
});
```

#### エントリの挿入

`put()` はキーバリューペアを追加し、`EntryId`（ブランド型 `number`）を返します。`'replace'` モードでは、既存キーへの挿入は元のエントリの `EntryId` を返します。この ID は、あとからエントリの参照・更新・削除に使えます。

**Node.js / TypeScript：**

```ts
const id1 = tree.put(10, 'ten');
const id2 = tree.put(20, 'twenty');
tree.put(10, 'updated ten'); // デフォルト 'replace' モード: 上書きされ、id1 は維持
```

**ブラウザ：**

```js
const id1 = tree.put(10, 'ten');
const id2 = tree.put(20, 'twenty');
```

**`putMany(entries)`** -- ソート済みの複数エントリを一括挿入します。ツリーが空の場合、O(n log n) ではなく O(n) の最適化されたバルクロードでツリーを構築します。エントリは昇順キー順である必要があります（`duplicateKeys` が `'reject'` または `'replace'` の場合は厳密な昇順）。

```ts
const ids = tree.putMany([
  { key: 1, value: 'a' },
  { key: 2, value: 'b' },
  { key: 3, value: 'c' },
]);
```

#### エントリの読み取り

**`peekById(entryId)`** -- ID でエントリを削除せずに参照します。

```ts
const entry = tree.peekById(id1);
// { entryId: 0, key: 10, value: 'updated ten' } または null（見つからない場合）
```

**`peekFirst()`** -- 最小キーのエントリを削除せずに取得します。

```ts
const first = tree.peekFirst();
// { entryId: ..., key: 10, value: 'ten' } または null（空の場合）
```

**`get(key)`** -- 結果配列を生成せずにキーの値を取得します。

```ts
const value = tree.get(10); // 'ten' またはキーが存在しない場合 null
```

**`hasKey(key)`** -- 指定キーのエントリが 1 件以上存在するか確認します。

```ts
const exists = tree.hasKey(10); // true
```

**`findFirst(key)`** -- 指定キーに一致する最初のエントリを返します。

```ts
const entry = tree.findFirst(10);
// { entryId: ..., key: 10, value: 'ten' } または null（見つからない場合）
```

**`findLast(key)`** -- 指定キーに一致する最後（最も新しく挿入された）のエントリを返します。

```ts
const entry = tree.findLast(10);
// { entryId: ..., key: 10, value: 'ten' } または null（見つからない場合）
```

**`peekLast()`** -- 最大キーのエントリを削除せずに取得します。

```ts
const last = tree.peekLast();
// { entryId: ..., key: 20, value: 'twenty' } または null（空の場合）
```

#### エントリの更新

**`updateById(entryId, newValue)`** -- 既存エントリの値を更新します。キーとツリー内の位置は変わりません。

```ts
const updated = tree.updateById(id1, 'TEN');
// { entryId: 0, key: 10, value: 'TEN' } または null（見つからない場合）
```

#### エントリの削除

**`remove(key)`** -- 指定キーに一致する最初のエントリを削除します。

```ts
const removed = tree.remove(10);
// { entryId: ..., key: 10, value: 'ten' } または null（見つからない場合）
```

**`removeById(entryId)`** -- ID で特定のエントリを削除します。

```ts
const removed = tree.removeById(id2);
// { entryId: ..., key: 20, value: 'twenty' } または null（見つからない場合）
```

**`popFirst()`** -- 最小キーのエントリを削除して返します（優先度キューとして活用できます）。

```ts
const first = tree.popFirst();
// { entryId: ..., key: 10, value: 'ten' } または null（空の場合）
```

**`popLast()`** -- 最大キーのエントリを削除して返します。

```ts
const last = tree.popLast();
// { entryId: ..., key: 20, value: 'twenty' } または null（ツリーが空の場合）
```

**`clear()`** -- 全エントリを削除し、ツリーを空の状態に O(1) でリセットします。内部シーケンスカウンタもリセットされるため、新しい `EntryId` はゼロから始まります。`clear()` 前に取得した `EntryId` は無効になります。

```ts
tree.clear();
tree.size(); // 0
```

**`deleteRange(startKey, endKey, options?)`** -- 範囲内のエントリを削除し、削除件数を返します。`range` と同じ境界セマンティクスに従います。

```ts
tree.deleteRange(2, 4); // キー 2, 3, 4 を削除 -- 削除件数を返す
tree.deleteRange(2, 4, { lowerBound: 'exclusive' }); // キー 3, 4 を削除
```

#### クエリ

**`count(startKey, endKey, options?)`** -- 結果配列を割り当てずに範囲内のエントリ数をカウントします。`range` と同じ境界セマンティクスに従います。

```ts
tree.put(1, 'a');
tree.put(2, 'b');
tree.put(3, 'c');
tree.put(4, 'd');

tree.count(2, 3); // 2
tree.count(1, 4, { lowerBound: 'exclusive' }); // 3
tree.count(1, 4, { upperBound: 'exclusive' }); // 3
```

**`range(startKey, endKey, options?)`** -- `startKey` から `endKey` までの全エントリを取得します（デフォルトで両端含む）。

```ts
tree.put(1, 'a');
tree.put(2, 'b');
tree.put(3, 'c');
tree.put(4, 'd');

const entries = tree.range(2, 3);
// [{ entryId: ..., key: 2, value: 'b' }, { entryId: ..., key: 3, value: 'c' }]
```

`RangeBounds` で各境界の包含・除外を制御できます。

```ts
tree.range(2, 4, { lowerBound: 'exclusive' });
// key 2 を除外 → [{ key: 3, ... }, { key: 4, ... }]

tree.range(2, 4, { upperBound: 'exclusive' });
// key 4 を除外 → [{ key: 2, ... }, { key: 3, ... }]

tree.range(2, 4, { lowerBound: 'exclusive', upperBound: 'exclusive' });
// 両端除外 → [{ key: 3, ... }]
```

**`nextHigherKey(key)`** -- 指定キーより厳密に大きい最小のキーを返します。

```ts
tree.put(10, 'a');
tree.put(20, 'b');
tree.nextHigherKey(10); // 20
tree.nextHigherKey(20); // null
```

**`nextLowerKey(key)`** -- 指定キーより厳密に小さい最大のキーを返します。

```ts
tree.nextLowerKey(20); // 10
tree.nextLowerKey(10); // null
```

**`getPairOrNextLower(key)`** -- 指定キーに一致するエントリ、またはそれより小さい最大のエントリを返します。

```ts
tree.getPairOrNextLower(15); // { entryId: ..., key: 10, value: 'a' }
tree.getPairOrNextLower(10); // { entryId: ..., key: 10, value: 'a' }（完全一致）
```

#### イテレーション

**`entries()`** -- スナップショット配列を生成せず、昇順でエントリを遅延イテレーションします。

```ts
for (const entry of tree.entries()) {
  console.log(entry.key, entry.value);
}
```

**`entriesReversed()`** -- 降順でエントリを遅延イテレーションします。

```ts
for (const entry of tree.entriesReversed()) {
  console.log(entry.key, entry.value); // 最大キーから順に出力
}
```

**`keys()`** / **`values()`** -- キーまたは値のみをイテレーションします。

```ts
const allKeys = [...tree.keys()]; // [1, 2, 3]
const allValues = [...tree.values()]; // ['a', 'b', 'c']
```

**`for...of`** -- ツリー自体がイテラブルです（`entries()` に委譲）。

```ts
for (const entry of tree) {
  console.log(entry.key, entry.value);
}
const asArray = [...tree]; // スプレッドも使えます
```

**`forEach(callback, thisArg?)`** -- 昇順で各エントリを訪問します。

```ts
tree.forEach((entry) => {
  console.log(entry.key, entry.value);
});
```

**`snapshot()`** -- 全エントリをソート順で取得します。

```ts
const all = tree.snapshot();
// [{ entryId, key, value }, ...]
```

**`size()`** -- エントリ数を取得します。

```ts
const count = tree.size(); // 4
```

#### 診断

**`getStats()`** -- ツリーの内部構造を確認します。

```ts
const stats = tree.getStats();
// { height: 1, leafCount: 1, branchCount: 0, entryCount: 4 }
```

**`assertInvariants()`** -- B+ tree の構造的な整合性を検証します。不正な場合は `BTreeInvariantError` をスローします。テストで便利です。

```ts
tree.assertInvariants(); // 不正な場合はスロー
```

#### クローンとシリアライズ

**`clone()`** -- 構造的に独立したディープコピーを作成します。

```ts
const copy = tree.clone();
copy.put(99, 'new');
tree.hasKey(99); // false -- 元のツリーには影響しない
```

**`toJSON()` / `fromJSON()`** -- ツリーをシリアライズ・復元します。

```ts
const json = tree.toJSON();
const restored = InMemoryBTree.fromJSON(json, (a, b) => a - b);
```

#### キー一意性ポリシー

`duplicateKeys` オプションで `put` の重複キー処理を制御できます。

```ts
const tree = new InMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  duplicateKeys: 'replace', // デフォルト
});
```

| ポリシー                  | 動作                                                          | 用途                                       |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `'replace'`（デフォルト） | 既存エントリの値を上書きし、元の `EntryId` を返す。           | キーバリューマップ / 辞書                  |
| `'reject'`                | キーが既に存在する場合、`BTreeValidationError` をスローする。 | 一意インデックス / セット                  |
| `'allow'`                 | 同一キーの複数エントリを許可し、挿入順で並べる。              | マルチマップ / イベントログ / 優先度キュー |

#### 動作に関する注意事項

- `range(start, end)` はデフォルトで両端を含みます。`RangeBounds` で除外境界を指定できます。`start > end` の場合は `[]` を返します。
- `EntryId` は `0` から始まるブランド型 `number` です。JavaScript では `0` は falsy なため、`if (entryId)` ではなく `if (entryId !== null)` や `if (entryId !== undefined)` を使用してください。
- コンパレータ契約（有限値、反射律、推移律）の検証は `assertInvariants()` で行われます。通常操作ごとの eager な検証は行いません。
- `compareKeys` は実行時にも関数である必要があります。関数以外を渡すと `BTreeValidationError` をスローします。
- `enableEntryIdLookup` のデフォルトは `false` です。`peekById` / `updateById` / `removeById` が必要な場合のみ `enableEntryIdLookup: true` を指定してください。
- `autoScale` のデフォルトは `false` です。`true` にするとエントリ数に応じてノード容量が段階的に拡大します（leaf: 32 -> 64 -> 128 -> 256 -> 512）。autoScale は容量を増加させるのみで、縮小はしません。

  | エントリ数 | maxLeafEntries | maxBranchChildren |
  | ---------- | -------------- | ----------------- |
  | 0+         | 32             | 32                |
  | 1,000+     | 64             | 64                |
  | 10,000+    | 128            | 128               |
  | 100,000+   | 256            | 128               |
  | 1,000,000+ | 512            | 256               |

- `autoScale` は `maxLeafEntries` / `maxBranchChildren` の明示指定と同時には使えません。
- `fromJSON` は `1,000,000` 件を超えるエントリを含むペイロードを拒否します。

---

### ConcurrentInMemoryBTree（マルチプロセス）

`ConcurrentInMemoryBTree` は、プラガブルな共有ストアを介して複数プロセスやインスタンス間でツリー状態を共有します。楽観的並行制御を使用し、各ミューテーションをストアに追加してコンフリクトを再同期とリトライで解決します。

#### 仕組み

1. 各インスタンスはローカルの `InMemoryBTree` をキャッシュとして保持します。
2. 読み取り前に共有ストアから同期します。
3. 書き込み時はストアにミューテーションを追加します。同時書き込みが発生した場合は再同期してリトライします（最大 `maxRetries` 回、デフォルト 16）。
4. 1 つのインスタンス内の非同期操作はすべて直列化され、二重適用を防ぎます。

#### SharedTreeStore の実装

`ConcurrentInMemoryBTree` は以下の 2 つのメソッドを持つ共有ストアを介して協調します。

- **`getLogEntriesSince(version)`** -- 指定バージョン以降のすべてのミューテーションを返し、各インスタンスが最新状態へキャッチアップできるようにします。
- **`append(expectedVersion, mutations)`** -- バージョンが一致する場合にミューテーションをアトミックに追加します（compare-and-swap）。`{ applied, version }` を返します。

ストアの実装は自由です。インメモリ配列、データベーステーブル、Redis stream など何でも使えます。以下はインメモリの参考実装です。

**Node.js / TypeScript：**

```ts
import {
  ConcurrentInMemoryBTree,
  type BTreeMutation,
  type SharedTreeLog,
  type SharedTreeStore,
} from '@frostpillar/frostpillar-btree';

class InMemorySharedStore<TKey, TValue> implements SharedTreeStore<
  TKey,
  TValue
> {
  private versions: {
    version: bigint;
    mutations: BTreeMutation<TKey, TValue>[];
  }[] = [{ version: 0n, mutations: [] }];

  public async getLogEntriesSince(
    version: bigint,
  ): Promise<SharedTreeLog<TKey, TValue>> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (version >= latestVersion) {
      return { version: latestVersion, mutations: [] };
    }

    const unseen: BTreeMutation<TKey, TValue>[] = [];
    for (const entry of this.versions) {
      if (entry.version > version) {
        unseen.push(...entry.mutations);
      }
    }

    return {
      version: latestVersion,
      mutations: structuredClone(unseen),
    };
  }

  public async append(
    expectedVersion: bigint,
    mutations: BTreeMutation<TKey, TValue>[],
  ): Promise<{ applied: boolean; version: bigint }> {
    const latestVersion = this.versions[this.versions.length - 1].version;
    if (latestVersion !== expectedVersion) {
      return { applied: false, version: latestVersion };
    }

    const nextVersion = latestVersion + 1n;
    this.versions.push({
      version: nextVersion,
      mutations: structuredClone(mutations),
    });
    return { applied: true, version: nextVersion };
  }
}
```

**ブラウザ：**

```js
const { ConcurrentInMemoryBTree } = window.FrostpillarBTree;

// 同じ方法で SharedTreeStore を実装してください。
// インターフェースには 2 つの非同期メソッドが必要です。
//   getLogEntriesSince(version) => { version, mutations }
//   append(expectedVersion, mutations) => { applied, version }
```

#### 協調インスタンスの作成

```ts
const store = new InMemorySharedStore<number, string>();

const instanceA = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
  store,
});

const instanceB = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (left: number, right: number): number => left - right,
  enableEntryIdLookup: true,
  store,
});
```

`maxRetries`（デフォルト: 16、最小: 1、最大: 1024）を設定できます。

```ts
const instance = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  maxRetries: 32,
});
```

`sync` 1 回で適用するミューテーション数の上限として `maxSyncMutationsPerBatch` も設定できます（デフォルト: `100000`、最小: `1`、最大: `1000000`）。

```ts
const hardened = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  maxSyncMutationsPerBatch: 50000,
});
```

#### Concurrent API の使い方

メソッドはすべて非同期です。書き込みはストアを介して協調し、読み取りは返す前に同期します（`readMode` が `'strong'`（デフォルト）の場合）。

`readMode` を `'local'` に設定すると、読み取り時の同期をスキップできます。ローカルモードではローカルツリーに対してのみ読み取りを実行するため、古いデータを返す可能性があります。明示的な `sync()` で最新状態に追いつきます。

```ts
const localInstance = new ConcurrentInMemoryBTree<number, string>({
  compareKeys: (a, b) => a - b,
  store,
  readMode: 'local',
});

await localInstance.put(1, 'one');
await localInstance.sync(); // 明示的に最新状態を取得
const value = await localInstance.get(1);
```

```ts
// インスタンス A が挿入
const insertedId = await instanceA.put(100, 'draft docs');

// インスタンス B は同じ EntryId をすぐに使える
const updated = await instanceB.updateById(insertedId, 'publish docs');

// インスタンス A が削除
const removed = await instanceA.removeById(insertedId);

// インスタンス B が同期し、削除を反映
await instanceB.sync();
const rows = await instanceB.snapshot(); // []
```

#### 動作に関する注意事項

- 同じ shared store を共有するすべてのインスタンスは、同一の設定（`compareKeys`、`duplicateKeys`、`maxLeafEntries`、`maxBranchChildren`、`enableEntryIdLookup`、`autoScale`）を使う必要があります。最初の書き込み時に設定フィンガープリントを含む `init` ミューテーションが追加され、他のインスタンスは同期時に検証します。不一致の場合は `BTreeConcurrencyError` がスローされます。コンパレータの一致は呼び出し側の責任です。
- `EntryId` はログ由来の識別子です。同じ shared store を参照して同期したインスタンス間で `peekById`、`removeById`、`updateById` に利用できます。
- 1 つのインスタンスではすべての非同期操作（`sync`、読み取り、書き込み）が直列化され、ローカルでの二重適用を防ぎます。
- プロセス間の保証は shared store の原子的な version 付き append に依存します。
- `maxRetries` 回のリトライ後もミューテーションを適用できない場合、`BTreeConcurrencyError` がスローされます。

---

### エラーハンドリング

`@frostpillar/frostpillar-btree` は 3 つのエラークラスをエクスポートします。すべて `Error` を継承します。

#### BTreeValidationError

設定・ポリシー制約へ違反した場合にスローされます。

**原因：**

- `maxLeafEntries` または `maxBranchChildren` が整数でない、3 未満、または 16384 を超える
- `duplicateKeys` に不正な値が設定されている
- `duplicateKeys` が `'reject'` のとき、既存キーで `put` が呼ばれた
- `enableEntryIdLookup` が `false` の状態で `removeById`、`peekById`、`updateById` が呼ばれた

```ts
import {
  BTreeValidationError,
  InMemoryBTree,
} from '@frostpillar/frostpillar-btree';

try {
  const tree = new InMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    duplicateKeys: 'reject',
  });
  tree.put(1, 'one');
  tree.put(1, 'duplicate'); // BTreeValidationError をスロー
} catch (error) {
  if (error instanceof BTreeValidationError) {
    console.error('重複キーが拒否されました:', error.message);
  }
}
```

#### BTreeInvariantError

`assertInvariants()` で B+ tree の内部構造に不整合（コンパレータの反射律・推移律違反を含む）が検出された場合にスローされます。ライブラリのバグ、コンパレータ契約違反、または外部操作による破損を示します。

```ts
import {
  BTreeInvariantError,
  InMemoryBTree,
} from '@frostpillar/frostpillar-btree';

const tree = new InMemoryBTree<number, string>({
  compareKeys: (a, b) => (a === b ? 1 : a - b),
});
tree.put(1, 'one');

try {
  tree.assertInvariants();
} catch (error) {
  if (error instanceof BTreeInvariantError) {
    console.error('ツリー構造が破損しています:', error.message);
  }
}
```

#### BTreeConcurrencyError

`ConcurrentInMemoryBTree` で以下の場合にスローされます。

- `maxRetries` 回のリトライ後も同時更新によりミューテーションを適用できない場合
- shared store がバージョン契約に違反した場合
- `maxRetries` に不正な値（1 以上 1024 以下の整数でない）が設定された場合
- `maxSyncMutationsPerBatch` に不正な値（1 以上 1000000 以下の整数でない）が設定された場合
- `sync` 時のミューテーション件数が `maxSyncMutationsPerBatch` を超えた場合

```ts
import {
  BTreeConcurrencyError,
  ConcurrentInMemoryBTree,
  type SharedTreeStore,
} from '@frostpillar/frostpillar-btree';

const store: SharedTreeStore<number, string> = {
  async getLogEntriesSince() {
    return { version: 0n, mutations: [] };
  },
  async append() {
    return { applied: true, version: 1n };
  },
};

try {
  new ConcurrentInMemoryBTree<number, string>({
    compareKeys: (a, b) => a - b,
    store,
    maxRetries: 0,
  });
} catch (error) {
  if (error instanceof BTreeConcurrencyError) {
    console.error('並行設定が不正です:', error.message);
  }
}
```

---

## API リファレンス

### InMemoryBTree

| メソッド             | シグネチャ                                                                            | 説明                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `put`                | `(key: TKey, value: TValue) => EntryId`                                               | キーバリューペアを挿入し、`EntryId` を返す。                                      |
| `putMany`            | `(entries: readonly { key: TKey; value: TValue }[]) => EntryId[]`                     | ソート済みエントリの一括挿入。空のツリーでは O(n)。非空ツリーではカーソル最適化。 |
| `remove`             | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | 指定キーに一致する最初のエントリを削除する。                                      |
| `removeById`         | `(entryId: EntryId) => BTreeEntry<TKey, TValue> \| null`                              | ID でエントリを削除する。                                                         |
| `peekById`           | `(entryId: EntryId) => BTreeEntry<TKey, TValue> \| null`                              | ID でエントリを削除せずに参照する。                                               |
| `updateById`         | `(entryId: EntryId, value: TValue) => BTreeEntry<TKey, TValue> \| null`               | ID でエントリの値を更新する。                                                     |
| `popFirst`           | `() => BTreeEntry<TKey, TValue> \| null`                                              | 最小キーのエントリを削除して返す。                                                |
| `popLast`            | `() => BTreeEntry<TKey, TValue> \| null`                                              | 最大キーのエントリを削除して返す。                                                |
| `peekFirst`          | `() => BTreeEntry<TKey, TValue> \| null`                                              | 最小キーのエントリを削除せずに返す。                                              |
| `peekLast`           | `() => BTreeEntry<TKey, TValue> \| null`                                              | 最大のエントリを削除せずに返す。                                                  |
| `findFirst`          | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | キーに一致する最初のエントリを返す。                                              |
| `findLast`           | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | キーに一致する最後のエントリを返す。                                              |
| `get`                | `(key: TKey) => TValue \| null`                                                       | 指定キーの最初の値を返す。キーがない場合は null。                                 |
| `hasKey`             | `(key: TKey) => boolean`                                                              | 指定キーのエントリが 1 件以上存在するか確認する。                                 |
| `count`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => number`                     | 配列割り当てなしで範囲内のエントリ数を返す。境界はデフォルトで包含。              |
| `range`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => BTreeEntry<TKey, TValue>[]` | startKey から endKey のエントリを返す。境界はデフォルトで包含。                   |
| `nextHigherKey`      | `(key: TKey) => TKey \| null`                                                         | 指定キーより大きい次のキーを返す。                                                |
| `nextLowerKey`       | `(key: TKey) => TKey \| null`                                                         | 指定キーより小さい次のキーを返す。                                                |
| `getPairOrNextLower` | `(key: TKey) => BTreeEntry<TKey, TValue> \| null`                                     | 一致エントリまたはそれより小さい最大のエントリを返す。                            |
| `deleteRange`        | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => number`                     | 範囲内のエントリを削除し、削除件数を返す。                                        |
| `entries`            | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | 昇順で全エントリを遅延イテレーションする。                                        |
| `entriesReversed`    | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | 降順で全エントリを遅延イテレーションする。                                        |
| `keys`               | `() => IterableIterator<TKey>`                                                        | 昇順で全キーを遅延イテレーションする。                                            |
| `values`             | `() => IterableIterator<TValue>`                                                      | 昇順で全値を遅延イテレーションする。                                              |
| `[Symbol.iterator]`  | `() => IterableIterator<BTreeEntry<TKey, TValue>>`                                    | `for...of` やスプレッドを有効にする。`entries()` に委譲。                         |
| `forEach`            | `(callback: (entry) => void, thisArg?) => void`                                       | 昇順で各エントリを訪問する。                                                      |
| `snapshot`           | `() => BTreeEntry<TKey, TValue>[]`                                                    | 全エントリをソート順で返す。                                                      |
| `clear`              | `() => void`                                                                          | 全エントリを削除し、空の状態に O(1) でリセットする。                              |
| `size`               | `() => number`                                                                        | エントリ数を返す。                                                                |
| `getStats`           | `() => BTreeStats`                                                                    | 構造統計を返す。                                                                  |
| `assertInvariants`   | `() => void`                                                                          | B+ tree の構造的な整合性を検証する。不正な場合はスローする。                      |
| `clone`              | `() => InMemoryBTree<TKey, TValue>`                                                   | 構造的に独立したディープコピーを返す。                                            |
| `toJSON`             | `() => BTreeJSON<TKey, TValue>`                                                       | バージョン付き JSON 互換ペイロードにシリアライズする。                            |
| `fromJSON` (静的)    | `(json, compareKeys) => InMemoryBTree<TKey, TValue>`                                  | `toJSON` ペイロードからツリーを再構築する。                                       |

**コンストラクタ：**

```ts
new InMemoryBTree<TKey, TValue>(config: InMemoryBTreeConfig<TKey>)
```

### ConcurrentInMemoryBTree

`InMemoryBTree` メソッドのサブセットを `Promise` を返す非同期版として提供します。書き込みは shared store を介して協調し、`readMode` が `'strong'`（デフォルト）の場合は読み取り前に同期します。`readMode` が `'local'` の場合、読み取りは同期なしでローカルツリーに対して実行されます。`putMany`・`deleteRange`・イテレータ・`clear`・`clone`・`toJSON`/`fromJSON` は現在未対応です。

| メソッド             | シグネチャ                                                                                     | 説明                                               |
| -------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `sync`               | `() => Promise<void>`                                                                          | shared store の最新ログを取得して適用する。        |
| `put`                | `(key: TKey, value: TValue) => Promise<EntryId>`                                               | 楽観的並行制御で挿入する。                         |
| `remove`             | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | 指定キーに一致する最初のエントリを削除する。       |
| `removeById`         | `(entryId: EntryId) => Promise<BTreeEntry<TKey, TValue> \| null>`                              | ID でエントリを削除する。                          |
| `peekById`           | `(entryId: EntryId) => Promise<BTreeEntry<TKey, TValue> \| null>`                              | ID でエントリを参照する（事前に同期）。            |
| `updateById`         | `(entryId: EntryId, value: TValue) => Promise<BTreeEntry<TKey, TValue> \| null>`               | 楽観的並行制御で ID のエントリ値を更新する。       |
| `popFirst`           | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | 最小キーのエントリを削除して返す。                 |
| `popLast`            | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | 最大キーのエントリを削除して返す。                 |
| `peekFirst`          | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | 最小キーのエントリを返す（事前に同期）。           |
| `peekLast`           | `() => Promise<BTreeEntry<TKey, TValue> \| null>`                                              | 最大キーのエントリを返す（事前に同期）。           |
| `findFirst`          | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | キーに一致する最初のエントリを返す（事前に同期）。 |
| `findLast`           | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | キーに一致する最後のエントリを返す（事前に同期）。 |
| `get`                | `(key: TKey) => Promise<TValue \| null>`                                                       | キーの値を取得する（事前に同期）。                 |
| `hasKey`             | `(key: TKey) => Promise<boolean>`                                                              | キーの存在を確認する（事前に同期）。               |
| `count`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => Promise<number>`                     | 範囲内のエントリ数を返す（事前に同期）。           |
| `range`              | `(startKey: TKey, endKey: TKey, options?: RangeBounds) => Promise<BTreeEntry<TKey, TValue>[]>` | 範囲クエリ（事前に同期）。                         |
| `nextHigherKey`      | `(key: TKey) => Promise<TKey \| null>`                                                         | 指定キーより大きい次のキー（事前に同期）。         |
| `nextLowerKey`       | `(key: TKey) => Promise<TKey \| null>`                                                         | 指定キーより小さい次のキー（事前に同期）。         |
| `getPairOrNextLower` | `(key: TKey) => Promise<BTreeEntry<TKey, TValue> \| null>`                                     | 一致または次に小さいエントリ（事前に同期）。       |
| `snapshot`           | `() => Promise<BTreeEntry<TKey, TValue>[]>`                                                    | 全エントリを返す（事前に同期）。                   |
| `size`               | `() => Promise<number>`                                                                        | エントリ数を返す（事前に同期）。                   |
| `getStats`           | `() => Promise<BTreeStats>`                                                                    | 構造統計を返す（事前に同期）。                     |
| `assertInvariants`   | `() => Promise<void>`                                                                          | 構造的な整合性を検証する（事前に同期）。           |

**コンストラクタ：**

```ts
new ConcurrentInMemoryBTree<TKey, TValue>(config: ConcurrentInMemoryBTreeConfig<TKey, TValue>)
```

### エクスポートされる型

| 型                                            | 説明                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntryId`                                     | エントリを識別するブランド型 `number`。                                                                                                                                             |
| `BTreeEntry<TKey, TValue>`                    | `{ entryId: EntryId; key: TKey; value: TValue }`                                                                                                                                    |
| `BTreeJSON<TKey, TValue>`                     | `toJSON()` が生成し `fromJSON()` が受け取る、バージョン付き JSON シリアライズ可能なペイロード。                                                                                     |
| `BTreeStats`                                  | `{ height: number; leafCount: number; branchCount: number; entryCount: number }`                                                                                                    |
| `KeyComparator<TKey>`                         | `(left: TKey, right: TKey) => number`                                                                                                                                               |
| `DuplicateKeyPolicy`                          | `'allow' \| 'reject' \| 'replace'`                                                                                                                                                  |
| `RangeBounds`                                 | `{ lowerBound?: 'inclusive' \| 'exclusive'; upperBound?: 'inclusive' \| 'exclusive' }`                                                                                              |
| `InMemoryBTreeConfig<TKey>`                   | `{ compareKeys: KeyComparator<TKey>; maxLeafEntries?: number; maxBranchChildren?: number; duplicateKeys?: DuplicateKeyPolicy; enableEntryIdLookup?: boolean; autoScale?: boolean }` |
| `ReadMode`                                    | `'strong' \| 'local'`                                                                                                                                                               |
| `ConcurrentInMemoryBTreeConfig<TKey, TValue>` | `InMemoryBTreeConfig<TKey>` を拡張し、`store: SharedTreeStore<TKey, TValue>`、`maxRetries?: number`、`maxSyncMutationsPerBatch?: number`、`readMode?: ReadMode` を追加。            |
| `SharedTreeStore<TKey, TValue>`               | `getLogEntriesSince(version)` と `append(expectedVersion, mutations)` を持つインターフェース。                                                                                      |
| `SharedTreeLog<TKey, TValue>`                 | `{ version: bigint; mutations: BTreeMutation<TKey, TValue>[] }`                                                                                                                     |
| `BTreeMutation<TKey, TValue>`                 | 判別共用体: `init`、`put`、`remove`、`removeById`、`updateById`、`popFirst`、`popLast`。                                                                                            |
| `BTreeValidationError`                        | コンパレータや設定の違反でスローされるエラー。                                                                                                                                      |
| `BTreeInvariantError`                         | ツリー構造の整合性違反でスローされるエラー。                                                                                                                                        |
| `BTreeConcurrencyError`                       | 並行処理コンフリクトやストア契約違反でスローされるエラー。                                                                                                                          |

> **サブパスエクスポート：** `/core` サブパス（`@frostpillar/frostpillar-btree/core`）は単一プロセス向けの型のみエクスポートします: `InMemoryBTree`、`EntryId`、`BTreeEntry`、`BTreeJSON`、`BTreeStats`、`KeyComparator`、`DuplicateKeyPolicy`、`RangeBounds`、`InMemoryBTreeConfig`、`BTreeValidationError`、`BTreeInvariantError`。並行処理関連のエクスポート（`ConcurrentInMemoryBTree`、`ConcurrentInMemoryBTreeConfig`、`ReadMode`、`SharedTreeStore`、`SharedTreeLog`、`BTreeMutation`、`BTreeConcurrencyError`）はメインエントリポイントからのみ利用できます。

---

## コントリビュートガイド

### 前提条件

- Node.js >= 24.0.0
- pnpm >= 10.0.0

### セットアップ

```bash
git clone https://github.com/hjmsano/frostpillar-btree.git
cd frostpillar-btree
pnpm install
```

### 開発コマンド

| コマンド                                                        | 説明                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm build`                                                    | ESM、CJS、型宣言を `dist/` にビルドする。                    |
| `pnpm test`                                                     | 全テストを実行する。                                         |
| `pnpm test tests/inMemoryBTree.test.ts`                         | InMemoryBTree テストを実行する。                             |
| `pnpm test tests/concurrentInMemoryBTree.test.ts`               | ConcurrentInMemoryBTree テストを実行する。                   |
| `pnpm test tests/concurrentInMemoryBTree.operations.test.ts`    | 同時操作テストを実行する。                                   |
| `pnpm test tests/concurrentInMemoryBTree.storeContract.test.ts` | ストア契約テストを実行する。                                 |
| `pnpm test tests/bundleBuildContract.test.ts`                   | バンドルビルド契約テストを実行する。                         |
| `pnpm test tests/githubActionsWorkflows.test.ts`                | ワークフロー契約テストを実行する。                           |
| `pnpm build:bundle`                                             | ブラウザ向けフルバンドルをビルドする（並行 API を含む）。    |
| `pnpm build:bundle:core`                                        | ブラウザ向けコアバンドルをビルドする（InMemoryBTree のみ）。 |
| `pnpm bench`                                                    | ベンチマークを実行する（事前に `pnpm build` が必要）。       |
| `pnpm check`                                                    | typecheck + lint + test + textlint を実行する。              |

### ブランチとリリースモデル

- デフォルトブランチは `main` です。
- リリースは [Release Please](https://github.com/googleapis/release-please)（`.github/workflows/ci-release.yml`）で管理します。
- Conventional Commits 互換の PR を `main` にマージすると、Release Please がバージョン更新 PR を `main` に対して作成・更新します。
- バージョン更新 PR をマージすると、GitHub Release 作成、ブラウザバンドルのアップロード（`frostpillar-btree.min.js` および `frostpillar-btree-core.min.js`）、npm への publish が実行されます。

### ドキュメント

- [ドキュメント目次](./docs/INDEX.md)
- [ライブラリ仕様](./docs/specs/01_in-memory-btree.md)
- [リリース仕様](./docs/specs/02_release-driven-cicd-and-publish.md)

## ライセンス

[MIT](./LICENSE)
