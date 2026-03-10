import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { BIN_PATH, FIXTURES_DIR } from './test-paths.js';

function runInFixture(fixture, args) {
  const result = spawnSync('node', [BIN_PATH, 'audit', ...args], {
    cwd: path.join(FIXTURES_DIR, fixture),
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

test('default audit exits 0 even with findings', () => {
  const result = runInFixture('audit-fail', []);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
});

test('default text audit includes fix advice for failed checks', () => {
  const result = runInFixture('audit-fail', []);
  assert.match(result.stdout, /Fix: Remove plain-text credentials from source and use secure storage and hashing\./);
});

test('audit omits fix advice when --no-advice is set', () => {
  const result = runInFixture('audit-fail', ['--no-advice']);
  assert.doesNotMatch(result.stdout, /Fix:/);
});

test('json audit output still includes remediation metadata', () => {
  const result = runInFixture('audit-fail', ['--format', 'json']);
  const payload = JSON.parse(result.stdout.replace(/^[\s\S]*?(\{\s*"profile")/m, '$1'));
  const finding = payload.findings.find((entry) => entry.ruleId === 'no-hardcoded-secrets');

  assert.equal(typeof finding?.remediation, 'string');
  assert.equal(
    finding?.remediation,
    'Move secrets to environment variables or a secrets manager and rotate exposed credentials.'
  );
});

test('audit fails with explicit fail-on threshold', () => {
  const result = runInFixture('audit-fail', ['--fail-on', 'high']);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
});

test('audit fails when require-core and profile excludes core', () => {
  const standardsDir = path.join(FIXTURES_DIR, 'audit-missing-core', 'standards');
  fs.mkdirSync(standardsDir, { recursive: true });
  fs.writeFileSync(
    path.join(standardsDir, '.prodready'),
    JSON.stringify(
      {
        version: '1.0.1',
        installedAt: '2026-03-08T00:00:00.000Z',
        selectedStandards: ['EMAIL'],
        excludedStandards: [
          'SECURITY',
          'PRIVACY',
          'AUTHENTICATION',
          'PAYMENTS',
          'RELIABILITY',
          'ACCESSIBILITY',
          'UX-STATES',
          'API-DESIGN',
          'DOCUMENTATION',
        ],
        mode: 'only',
      },
      null,
      2
    )
  );

  const result = runInFixture('audit-missing-core', ['--require-core']);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
});

test('audit enforces thresholds from prodready.json when CLI flags are omitted', () => {
  const result = runInFixture('audit-fail-with-policy', []);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
});

test('audit CLI flags override prodready.json policy', () => {
  const result = runInFixture('audit-fail-with-policy', ['--fail-on', 'none', '--min-score', '0']);
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
});

test('audit errors when prodready.json is invalid JSON', () => {
  const standardsDir = path.join(FIXTURES_DIR, 'audit-fail');
  const configPath = path.join(standardsDir, 'prodready.json');
  fs.writeFileSync(configPath, '{ invalid');

  const result = runInFixture('audit-fail', []);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stderr || result.stdout, /Invalid prodready\.json/);

  fs.rmSync(configPath);
});

test('audit errors when prodready.json minScore is null', () => {
  const result = runInFixture('audit-invalid-minscore-null', []);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stderr || result.stdout, /auditPolicy\.minScore must be a number between 0 and 100/);
});

test('audit errors when auditPolicy is not an object', () => {
  const result = runInFixture('audit-invalid-policy-type', []);
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stderr || result.stdout, /auditPolicy must be an object/);
});

test('audit --agent-prompt prints a copy/paste prompt block for failed checks', () => {
  const result = runInFixture('audit-fail', ['--agent-prompt']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Copy\/Paste for Coding Agent/);
  assert.match(result.stdout, /```txt[\s\S]*Fix the following ProdReady audit failures[\s\S]*```/);
  assert.match(result.stdout, /Remediation:/);
});

test('audit --agent-prompt limits output to top 3 failed checks', () => {
  const result = runInFixture('audit-fail', ['--agent-prompt']);
  const blockMatch = result.stdout.match(/```txt[\s\S]*?```/);
  assert.ok(blockMatch, 'Expected a fenced prompt block');
  const targets = blockMatch[0].match(/\n[1-3]\. \[[^\]]+\]/g) || [];
  assert.equal(targets.length, 3);
  assert.doesNotMatch(blockMatch[0], /\n4\. \[/);
});

test('audit --agent-prompt includes file:line evidence and excludes snippets', () => {
  const result = runInFixture('audit-fail', ['--agent-prompt']);
  const blockMatch = result.stdout.match(/```txt[\s\S]*?```/);
  assert.ok(blockMatch, 'Expected a fenced prompt block');
  const block = blockMatch[0];
  assert.match(block, /Evidence: .*src\/index\.js:\d+/);
  assert.doesNotMatch(block, /const password = "supersecret123"/);
});

test('audit --agent-prompt prints no block when there are no failed checks', () => {
  const result = runInFixture('audit-pass-email', ['--agent-prompt']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No failed checks to generate an agent prompt\./);
  assert.doesNotMatch(result.stdout, /```txt/);
});

test('audit --no-advice --agent-prompt keeps prompt block while hiding Fix lines', () => {
  const result = runInFixture('audit-fail', ['--no-advice', '--agent-prompt']);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Fix:/);
  assert.match(result.stdout, /```txt[\s\S]*```/);
});

test('audit --format json --agent-prompt remains unchanged JSON shape', () => {
  const result = runInFixture('audit-fail', ['--format', 'json', '--agent-prompt']);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.replace(/^[\s\S]*?(\{\s*"profile")/m, '$1'));
  assert.equal(typeof payload, 'object');
  assert.equal('profile' in payload, true);
  assert.equal('score' in payload, true);
  assert.equal('thresholds' in payload, true);
  assert.equal('findings' in payload, true);
  assert.doesNotMatch(result.stdout, /Copy\/Paste for Coding Agent|```txt/);
});
