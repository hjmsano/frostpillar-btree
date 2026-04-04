import { spawn } from 'node:child_process';
import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const testOutDir = path.resolve(cwd, '.tmp-test-dist');
const compiledTestsRoot = path.resolve(testOutDir, 'tests');

const runCommand = async (command, args) => {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${String(code)}`,
        ),
      );
    });
  });
};

const collectTestFiles = async (directoryPath) => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await collectTestFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(absolutePath);
    }
  }

  return files;
};

const toCompiledTestPath = (inputPath) => {
  const normalizedInput = inputPath.replace(/\\/g, '/');
  const relativeInput = path.isAbsolute(normalizedInput)
    ? path.relative(cwd, normalizedInput)
    : normalizedInput;
  const trimmedInput = relativeInput.startsWith('./')
    ? relativeInput.slice(2)
    : relativeInput;

  if (trimmedInput.startsWith('.tmp-test-dist/')) {
    return path.resolve(cwd, trimmedInput);
  }

  const jsRelativePath = trimmedInput.endsWith('.ts')
    ? `${trimmedInput.slice(0, -3)}.js`
    : trimmedInput;

  return path.resolve(testOutDir, jsRelativePath);
};

const main = async () => {
  const userArgs = process.argv.slice(2);
  const coverage = userArgs.includes('--coverage');
  const requestedInputs = userArgs.filter(
    (arg) => arg !== '--run' && arg !== '--coverage',
  );

  await rm(testOutDir, { recursive: true, force: true });
  await runCommand('pnpm', ['exec', 'tsc', '--project', 'tsconfig.test.json']);

  let compiledTestFiles;
  if (requestedInputs.length === 0) {
    try {
      await access(compiledTestsRoot);
    } catch {
      throw new Error(
        'No compiled tests found. Expected tests under tests/**/*.test.ts.',
      );
    }

    compiledTestFiles = await collectTestFiles(compiledTestsRoot);
  } else {
    compiledTestFiles = requestedInputs.map(toCompiledTestPath);
  }

  if (compiledTestFiles.length === 0) {
    throw new Error('No test files matched the requested target.');
  }

  const nodeFlags = ['--test'];
  if (coverage) {
    nodeFlags.push(
      '--experimental-test-coverage',
      '--enable-source-maps',
    );
  }
  await runCommand('node', [...nodeFlags, ...compiledTestFiles]);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
