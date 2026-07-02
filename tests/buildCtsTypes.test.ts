import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const scriptPath = path.resolve(process.cwd(), 'scripts/build-cts-types.mjs');

const deriveCtsSource = async (declarationSource: string): Promise<string> => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'build-cts-types-'));
  try {
    await mkdir(path.join(workDir, 'dist'));
    await writeFile(
      path.join(workDir, 'dist', 'sample.d.ts'),
      declarationSource,
    );
    await execFileAsync(process.execPath, [scriptPath], { cwd: workDir });
    return await readFile(path.join(workDir, 'dist', 'sample.d.cts'), 'utf8');
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

void test('build:types:cjs rewrites relative .js specifiers to .cjs', async (): Promise<void> => {
  const output = await deriveCtsSource(
    [
      "import { A } from './a.js';",
      "import './side-effect.js';",
      "export { B } from '../b.js';",
      "export * from './c.js';",
      "export declare const lazy: () => Promise<typeof import('./d.js')>;",
    ].join('\n'),
  );

  assert.equal(
    output,
    [
      "import { A } from './a.cjs';",
      "import './side-effect.cjs';",
      "export { B } from '../b.cjs';",
      "export * from './c.cjs';",
      "export declare const lazy: () => Promise<typeof import('./d.cjs')>;",
    ].join('\n'),
    'Every relative .js specifier, including side-effect imports, must become .cjs.',
  );
});

void test('build:types:cjs leaves non-relative specifiers untouched', async (): Promise<void> => {
  const source = [
    "import { X } from 'some-pkg';",
    "import 'bare-polyfill.js';",
    "export declare const remote: () => Promise<typeof import('other-pkg')>;",
  ].join('\n');

  const output = await deriveCtsSource(source);

  assert.equal(
    output,
    source,
    'Bare specifiers must not be rewritten even when they end in .js.',
  );
});
