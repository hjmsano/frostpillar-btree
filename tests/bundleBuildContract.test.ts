import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

interface TsConfigCompilerOptions {
  readonly target?: string;
  readonly moduleResolution?: string;
}

interface TsConfigFile {
  readonly extends?: string;
  readonly compilerOptions?: TsConfigCompilerOptions;
}

interface PackageExportCondition {
  readonly types?: string;
  readonly import?: string;
  readonly require?: string;
  readonly default?: string;
}

interface PackageExports {
  readonly '.': PackageExportCondition;
  readonly './core'?: PackageExportCondition;
}

interface PackageJsonShape {
  readonly main?: string;
  readonly types?: string;
  readonly exports?: PackageExports;
  readonly files?: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
  readonly sideEffects?: false;
}

const readJsonFile = async <T>(...segments: string[]): Promise<T> => {
  const raw = await readFile(path.resolve(process.cwd(), ...segments), 'utf8');
  return JSON.parse(raw) as T;
};

void test('bundle tsconfig enforces ES2020 and bundler module resolution', async (): Promise<void> => {
  const bundleTsconfig = await readJsonFile<TsConfigFile>(
    'tsconfig.bundle.json',
  );

  assert.equal(
    bundleTsconfig.compilerOptions?.target,
    'ES2020',
    'tsconfig.bundle.json must set compilerOptions.target to ES2020.',
  );
  assert.equal(
    bundleTsconfig.compilerOptions?.moduleResolution,
    'bundler',
    'tsconfig.bundle.json must set compilerOptions.moduleResolution to bundler.',
  );
});

void test('package tsconfig enforces ES2022 target for npm module build', async (): Promise<void> => {
  const packageTsconfig = await readJsonFile<TsConfigFile>('tsconfig.json');

  assert.equal(
    packageTsconfig.compilerOptions?.target,
    'ES2022',
    'tsconfig.json must set compilerOptions.target to ES2022 for npm package output.',
  );
});

void test('package json root exports for hybrid delivery', async (): Promise<void> => {
  const packageJson = await readJsonFile<PackageJsonShape>('package.json');

  assert.equal(
    packageJson.main,
    './dist/index.cjs',
    'package.json main must point to dist/index.cjs for legacy CJS resolution.',
  );
  assert.equal(
    packageJson.types,
    './dist/index.d.ts',
    'package.json types must point to dist/index.d.ts.',
  );

  assert.equal(
    packageJson.exports?.['.']?.types,
    './dist/index.d.ts',
    'package.json exports["."].types must point to dist/index.d.ts.',
  );
  assert.equal(
    packageJson.exports?.['.']?.import,
    './dist/index.js',
    'package.json exports["."].import must point to dist/index.js.',
  );
  assert.equal(
    packageJson.exports?.['.']?.require,
    './dist/index.cjs',
    'package.json exports["."].require must point to dist/index.cjs.',
  );
});

void test('package json subpath exports for hybrid delivery', async (): Promise<void> => {
  const packageJson = await readJsonFile<PackageJsonShape>('package.json');

  assert.equal(
    packageJson.exports?.['./core']?.types,
    './dist/core.d.ts',
    'package.json exports["./core"].types must point to dist/core.d.ts.',
  );
  assert.equal(
    packageJson.exports?.['./core']?.import,
    './dist/core.js',
    'package.json exports["./core"].import must point to dist/core.js.',
  );
  assert.equal(
    packageJson.exports?.['./core']?.require,
    './dist/core.cjs',
    'package.json exports["./core"].require must point to dist/core.cjs.',
  );
});

void test('package json sideEffects is false for full tree-shaking', async (): Promise<void> => {
  const packageJson = await readJsonFile<PackageJsonShape>('package.json');

  assert.equal(
    packageJson.sideEffects,
    false,
    'package.json sideEffects must be false for tree-shaking.',
  );
});

void test('package json files and build scripts for npm distribution', async (): Promise<void> => {
  const packageJson = await readJsonFile<PackageJsonShape>('package.json');

  const requiredFiles = [
    'dist/**/*.js',
    'dist/**/*.cjs',
    'dist/**/*.d.ts',
    'README.md',
    'README-JA.md',
    'LICENSE',
  ];
  for (const file of requiredFiles) {
    assert.ok(
      packageJson.files?.includes(file) ?? false,
      `package.json files must include ${file} for npm distribution.`,
    );
  }
  assert.equal(
    packageJson.scripts?.build,
    'rm -rf dist && pnpm build:esm && pnpm build:cjs && pnpm build:types',
    'package.json build script must clean and run ESM, CJS, and type builds.',
  );
  assert.equal(
    packageJson.scripts?.['build:esm'],
    'esbuild src/index.ts src/core.ts --bundle --splitting --format=esm --platform=neutral --target=es2022 --tsconfig=tsconfig.bundle.json --outdir=dist',
    'package.json build:esm script must build bundled ESM with code splitting.',
  );
  assert.equal(
    packageJson.scripts?.['build:cjs'],
    'esbuild src/index.ts src/core.ts --bundle --platform=node --format=cjs --target=es2022 --tsconfig=tsconfig.bundle.json --outdir=dist --out-extension:.js=.cjs',
    'package.json build:cjs script must build CJS bundles for all entry points.',
  );
  assert.equal(
    packageJson.scripts?.['build:types'],
    'tsc --project tsconfig.build.json',
    'package.json build:types script must emit declaration files only.',
  );
  assert.equal(
    packageJson.scripts?.['build:bundle'],
    'esbuild src/index.ts --bundle --minify --target=es2020 --tsconfig=tsconfig.bundle.json --platform=browser --format=iife --global-name=FrostpillarBTree --outfile=dist/frostpillar-btree.min.js',
    'package.json build:bundle script must keep the full browser bundle contract.',
  );
  assert.equal(
    packageJson.scripts?.['build:bundle:core'],
    'esbuild src/InMemoryBTree.ts --bundle --minify --target=es2020 --tsconfig=tsconfig.bundle.json --platform=browser --format=iife --global-name=FrostpillarBTreeCore --outfile=dist/frostpillar-btree-core.min.js',
    'package.json build:bundle:core script must build the single-process core browser bundle.',
  );
});
