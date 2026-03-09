import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { BIN_PATH, REPO_ROOT } from './test-paths.js';

test('help output documents audit no-advice flag', () => {
  const result = spawnSync('node', [BIN_PATH, 'help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--no-advice/);
});
