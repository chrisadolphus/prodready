import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BIN_PATH } from './test-paths.js';

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prodready-init-'));
}

function runInit(cwd, args = []) {
  const result = spawnSync('node', [BIN_PATH, 'init', ...args], {
    cwd,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function readAgents(cwd) {
  return fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
}

function readConfig(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, 'prodready.json'), 'utf8'));
}

test('init creates AGENTS.md when missing', () => {
  const cwd = makeTempProject();
  const result = runInit(cwd);

  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(cwd, 'AGENTS.md')), true);
  assert.match(readAgents(cwd), /<!-- PRODREADY:START -->/);
  assert.match(readAgents(cwd), /Follow all rules in the `standards\/` directory of this project\./);
  assert.match(result.stdout, /AGENTS\.md created/);
});

test('init appends a managed block to an existing AGENTS.md without markers', () => {
  const cwd = makeTempProject();
  const existing = '# Team Agents\n\nCustom instructions stay here.\n';
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), existing);

  runInit(cwd, ['--only', 'security,privacy']);
  const content = readAgents(cwd);

  assert.match(content, /^# Team Agents/);
  assert.match(content, /Custom instructions stay here\./);
  assert.match(content, /<!-- PRODREADY:START -->[\s\S]*- SECURITY[\s\S]*- PRIVACY[\s\S]*<!-- PRODREADY:END -->/);
});

test('init replaces an existing managed block without duplicating it', () => {
  const cwd = makeTempProject();
  fs.writeFileSync(
    path.join(cwd, 'AGENTS.md'),
    [
      '# Team Agents',
      '',
      '<!-- PRODREADY:START -->',
      '## ProdReady',
      '',
      'Old content',
      '<!-- PRODREADY:END -->',
      '',
      'Keep this footer.',
      '',
    ].join('\n')
  );

  runInit(cwd, ['--only', 'security']);
  const content = readAgents(cwd);

  assert.equal(content.match(/<!-- PRODREADY:START -->/g)?.length, 1);
  assert.equal(content.match(/<!-- PRODREADY:END -->/g)?.length, 1);
  assert.doesNotMatch(content, /Old content/);
  assert.match(content, /- SECURITY/);
  assert.match(content, /Keep this footer\./);
});

test('init reflects the selected standards for exclude mode in AGENTS.md', () => {
  const cwd = makeTempProject();
  runInit(cwd, ['--exclude', 'payments,authentication']);
  const content = readAgents(cwd);

  assert.doesNotMatch(content, /- PAYMENTS/);
  assert.doesNotMatch(content, /- AUTHENTICATION/);
  assert.match(content, /- SECURITY/);
  assert.match(content, /- DOCUMENTATION/);
});

test('init reflects the selected standards for auto mode in AGENTS.md', () => {
  const cwd = makeTempProject();
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'auto-profile-project',
        dependencies: {
          stripe: '^1.0.0',
        },
      },
      null,
      2
    )
  );

  runInit(cwd, ['--auto']);
  const content = readAgents(cwd);

  assert.match(content, /- SECURITY/);
  assert.match(content, /- PRIVACY/);
  assert.match(content, /- RELIABILITY/);
  assert.match(content, /- DOCUMENTATION/);
  assert.match(content, /- PAYMENTS/);
});

test('init creates prodready.json with default audit policy', () => {
  const cwd = makeTempProject();
  const result = runInit(cwd);

  assert.equal(result.status, 0);
  const config = readConfig(cwd);
  assert.deepEqual(config.auditPolicy, {
    failOn: 'high',
    minScore: 85,
    requireCore: true,
  });
  assert.match(result.stdout, /prodready\.json created/);
});

test('init merges missing policy keys without removing existing config keys', () => {
  const cwd = makeTempProject();
  fs.writeFileSync(
    path.join(cwd, 'prodready.json'),
    JSON.stringify(
      {
        custom: { keep: true },
        auditPolicy: {
          minScore: 90,
        },
      },
      null,
      2
    )
  );

  runInit(cwd);
  const config = readConfig(cwd);

  assert.deepEqual(config.auditPolicy, {
    failOn: 'high',
    minScore: 90,
    requireCore: true,
  });
  assert.deepEqual(config.custom, { keep: true });
});

test('init fails when prodready.json is invalid JSON', () => {
  const cwd = makeTempProject();
  fs.writeFileSync(path.join(cwd, 'prodready.json'), '{ invalid');

  const result = runInit(cwd);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid prodready\.json/);
  assert.equal(fs.existsSync(path.join(cwd, 'standards')), false);
  assert.equal(fs.existsSync(path.join(cwd, 'AGENTS.md')), false);
});

test('init updates ci.yml with a managed ProdReady audit step and keeps it idempotent', () => {
  const cwd = makeTempProject();
  const workflowDir = path.join(cwd, '.github/workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, 'ci.yml'),
    [
      'name: CI',
      '',
      'on:',
      '  push:',
      '',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Checkout',
      '        uses: actions/checkout@v4',
      '      - name: Test',
      '        run: npm test',
      '',
    ].join('\n')
  );

  const first = runInit(cwd);
  assert.equal(first.status, 0);
  const contentAfterFirst = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
  assert.match(contentAfterFirst, /# PRODREADY:START/);
  assert.match(contentAfterFirst, /npx @chrisadolphus\/prodready audit/);

  const second = runInit(cwd);
  assert.equal(second.status, 0);
  const contentAfterSecond = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
  assert.equal(contentAfterFirst, contentAfterSecond);
});

test('init does not add a duplicate audit step when workflow already has one', () => {
  const cwd = makeTempProject();
  const workflowDir = path.join(cwd, '.github/workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, 'ci.yml'),
    [
      'name: CI',
      'on:',
      '  push:',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Existing audit',
      '        run: node bin/cli.js audit',
      '',
    ].join('\n')
  );

  const before = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
  const result = runInit(cwd);
  assert.equal(result.status, 0);
  const after = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');

  assert.equal(after, before);
  assert.doesNotMatch(after, /# PRODREADY:START/);
  assert.match(result.stdout, /already includes an audit step/);
});

test('init does not add a duplicate audit step when existing audit is in a multiline run block', () => {
  const cwd = makeTempProject();
  const workflowDir = path.join(cwd, '.github/workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, 'ci.yml'),
    [
      'name: CI',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Existing block audit',
      '        run: |',
      '          echo \"start\"',
      '          npx @chrisadolphus/prodready audit --format json',
      '',
    ].join('\n')
  );

  const before = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
  const result = runInit(cwd);
  assert.equal(result.status, 0);
  const after = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');

  assert.equal(after, before);
  assert.doesNotMatch(after, /# PRODREADY:START/);
  assert.match(result.stdout, /already includes an audit step/);
});

test('init does not add a duplicate audit step when existing audit is in a later job', () => {
  const cwd = makeTempProject();
  const workflowDir = path.join(cwd, '.github/workflows');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, 'ci.yml'),
    [
      'name: CI',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Lint',
      '        run: npm run lint',
      '  audit:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Existing audit second job',
      '        run: npx @chrisadolphus/prodready audit',
      '',
    ].join('\n')
  );

  const before = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');
  const result = runInit(cwd);
  assert.equal(result.status, 0);
  const after = fs.readFileSync(path.join(workflowDir, 'ci.yml'), 'utf8');

  assert.equal(after, before);
  assert.doesNotMatch(after, /# PRODREADY:START/);
  assert.match(result.stdout, /already includes an audit step/);
});
