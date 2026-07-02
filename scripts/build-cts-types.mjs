import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');

const collectDeclarationFiles = async (directoryPath) => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectDeclarationFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
};

// TypeScript flags declaration files that follow the package's "type":
// "module" as ESM, so `require()` consumers under moduleResolution node16
// see TS1479 unless the require condition resolves CJS-flavored .d.cts
// files. Relative specifiers must switch to .cjs so the whole declaration
// graph stays CJS-flavored; the .cjs runtime files they imply are never
// loaded (the require entry points are the bundled index.cjs / core.cjs).
const rewriteRelativeSpecifiers = (source) => {
  return source
    .replace(/((?:from|import)\s+['"])(\.\.?\/[^'"]*)\.js(['"])/g, '$1$2.cjs$3')
    .replace(/(import\(\s*['"])(\.\.?\/[^'"]*)\.js(['"]\s*\))/g, '$1$2.cjs$3');
};

const main = async () => {
  const declarationFiles = await collectDeclarationFiles(distDir);
  if (declarationFiles.length === 0) {
    throw new Error(
      'No .d.ts files found in dist/. Run `pnpm build:types` first.',
    );
  }

  for (const declarationFile of declarationFiles) {
    const source = await readFile(declarationFile, 'utf8');
    const outputPath = declarationFile.replace(/\.d\.ts$/, '.d.cts');
    await writeFile(outputPath, rewriteRelativeSpecifiers(source));
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
