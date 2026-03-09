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
