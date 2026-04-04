import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

interface WorkflowAssertion {
  readonly pattern: RegExp;
  readonly message: string;
}

interface WorkflowContract {
  readonly fileName: string;
  readonly testName: string;
  readonly assertions: readonly WorkflowAssertion[];
}

const WORKFLOWS_DIR = path.resolve(process.cwd(), '.github', 'workflows');

const readWorkflow = async (fileName: string): Promise<string> => {
  return readFile(path.resolve(WORKFLOWS_DIR, fileName), 'utf8');
};

const assertWorkflowContract = (
  workflowText: string,
  assertions: readonly WorkflowAssertion[],
): void => {
  for (const assertion of assertions) {
    assert.match(workflowText, assertion.pattern, assertion.message);
  }
};

const workflowContracts: readonly WorkflowContract[] = [
  {
    fileName: 'ci.yml',
    testName: 'CI workflow runs quality checks on every push',
    assertions: [
      {
        pattern: /\bon:\s*\n\s*push:\s*(\n|$)/m,
        message: 'ci.yml must trigger on push.',
      },
      {
        pattern: /uses:\s*actions\/checkout@[a-f0-9]{40}/,
        message: 'ci.yml must pin actions/checkout to a full commit SHA.',
      },
      {
        pattern: /uses:\s*pnpm\/action-setup@[a-f0-9]{40}/,
        message: 'ci.yml must pin pnpm/action-setup to a full commit SHA.',
      },
      {
        pattern: /uses:\s*actions\/setup-node@[a-f0-9]{40}/,
        message: 'ci.yml must pin actions/setup-node to a full commit SHA.',
      },
      {
        pattern: /run:\s*pnpm install --frozen-lockfile/,
        message: 'ci.yml must install dependencies with frozen lockfile.',
      },
      {
        pattern: /run:\s*pnpm check/,
        message:
          'ci.yml must run quality checks via pnpm check (typecheck, lint, test, textlint).',
      },
    ],
  },
  {
    fileName: 'ci-release.yml',
    testName:
      'release push release workflow uses release-please and conditionally builds/publishes artifacts',
    assertions: [
      {
        pattern:
          /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*-\s*["']main["']/m,
        message: 'ci-release.yml must trigger on main pushes.',
      },
      {
        pattern:
          /permissions:\s*\n(?:\s+[\w-]+:\s*\w+\n)*\s*contents:\s*write/m,
        message: 'ci-release.yml must request contents: write permission.',
      },
      {
        pattern:
          /permissions:\s*\n(?:\s+[\w-]+:\s*\w+\n)*\s*pull-requests:\s*write/m,
        message: 'ci-release.yml must request pull-requests: write permission.',
      },
      {
        pattern: /uses:\s*googleapis\/release-please-action@[a-f0-9]{40}/,
        message:
          'ci-release.yml must pin googleapis/release-please-action to a full commit SHA.',
      },
      {
        pattern: /target-branch:\s*["']main["']/,
        message:
          'ci-release.yml must set Release Please target-branch to main.',
      },
      {
        pattern:
          /token:\s*\$\{\{\s*secrets\.RELEASE_PLEASE_TOKEN\s*\|\|\s*secrets\.GITHUB_TOKEN\s*\}\}/,
        message:
          'ci-release.yml must use RELEASE_PLEASE_TOKEN fallback to GITHUB_TOKEN for release-please.',
      },
      {
        pattern:
          /if:\s*steps\.release\.outputs\.release_created\s*==\s*['"]true['"]/,
        message:
          'ci-release.yml must gate release build/publish steps on release_created output.',
      },
      {
        pattern: /uses:\s*actions\/checkout@[a-f0-9]{40}/,
        message:
          'ci-release.yml must pin actions/checkout to a full commit SHA.',
      },
      {
        pattern: /uses:\s*pnpm\/action-setup@[a-f0-9]{40}/,
        message:
          'ci-release.yml must pin pnpm/action-setup to a full commit SHA.',
      },
      {
        pattern: /uses:\s*actions\/setup-node@[a-f0-9]{40}/,
        message:
          'ci-release.yml must pin actions/setup-node to a full commit SHA.',
      },
      {
        pattern: /run:\s*pnpm check/,
        message: 'ci-release.yml must run quality checks via pnpm check.',
      },
      {
        pattern: /run:\s*pnpm build/,
        message: 'ci-release.yml must run package build via pnpm build.',
      },
      {
        pattern:
          /run:\s*\|\s*\n\s*pnpm build:bundle\s*\n\s*pnpm build:bundle:core/m,
        message:
          'ci-release.yml must build both browser bundles via pnpm build:bundle and pnpm build:bundle:core.',
      },
      {
        pattern:
          /gh release upload[\s\S]*\$\{\{\s*steps\.release\.outputs\.tag_name\s*\}\}[\s\S]*dist\/frostpillar-btree\.min\.js[\s\S]*dist\/frostpillar-btree-core\.min\.js[\s\S]*--clobber/,
        message:
          'ci-release.yml must upload both dist/frostpillar-btree.min.js and dist/frostpillar-btree-core.min.js to the release tag created by release-please.',
      },
      {
        pattern: /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
        message:
          'ci-release.yml must authenticate gh CLI with secrets.GITHUB_TOKEN.',
      },
      {
        pattern: /registry-url:\s*['"]https:\/\/registry\.npmjs\.org['"]/,
        message:
          'ci-release.yml must configure setup-node registry-url for npmjs.org.',
      },
      {
        pattern: /run:\s*pnpm publish --no-git-checks --access public/,
        message:
          'ci-release.yml must publish with pnpm publish --no-git-checks --access public.',
      },
      {
        pattern: /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/,
        message:
          'ci-release.yml must authenticate package publish with NODE_AUTH_TOKEN and NPM_TOKEN.',
      },
    ],
  },
];

void test('CI workflow must not exclude main branch pushes', async (): Promise<void> => {
  const workflow = await readWorkflow('ci.yml');
  assert.doesNotMatch(
    workflow,
    /branches-ignore:\s*(?:\n\s*-\s*["']?main["']?)+/m,
    'ci.yml must not exclude main branch pushes.',
  );
});

for (const contract of workflowContracts) {
  void test(contract.testName, async (): Promise<void> => {
    const workflow = await readWorkflow(contract.fileName);
    assertWorkflowContract(workflow, contract.assertions);
  });
}
