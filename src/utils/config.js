import fs from 'fs';
import path from 'path';
import { getValidSeverities, normalizeSeverity } from './rules.js';

export const PRODREADY_CONFIG_FILE = 'prodready.json';

export function getProdreadyConfigPath(cwd) {
  return path.join(cwd, PRODREADY_CONFIG_FILE);
}

export function readProdreadyConfig(cwd) {
  const configPath = getProdreadyConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      path: configPath,
      data: null,
      error: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      exists: true,
      path: configPath,
      data: parsed && typeof parsed === 'object' ? parsed : {},
      error: null,
    };
  } catch {
    return {
      exists: true,
      path: configPath,
      data: null,
      error: 'invalid-json',
    };
  }
}

export function validateAuditPolicy(candidate) {
  if (candidate !== undefined) {
    const isObject = typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
    if (!isObject) {
      return {
        valid: false,
        errors: ['auditPolicy must be an object'],
        value: {
          failOn: null,
          minScore: null,
          requireCore: false,
        },
      };
    }
  }

  const policy = candidate && typeof candidate === 'object' ? candidate : {};
  const errors = [];

  const failOnRaw = policy.failOn;
  const failOn = failOnRaw === undefined ? null : String(failOnRaw).toLowerCase();
  if (failOn != null && failOn !== 'none' && !normalizeSeverity(failOn)) {
    errors.push(`auditPolicy.failOn must be one of: ${getValidSeverities().join(', ')}, none`);
  }

  const minScoreRaw = policy.minScore;
  const hasMinScore = minScoreRaw !== undefined;
  const minScore = hasMinScore ? minScoreRaw : null;
  if (hasMinScore && (typeof minScore !== 'number' || !Number.isFinite(minScore) || minScore < 0 || minScore > 100)) {
    errors.push('auditPolicy.minScore must be a number between 0 and 100');
  }

  const requireCoreRaw = policy.requireCore;
  if (requireCoreRaw !== undefined && typeof requireCoreRaw !== 'boolean') {
    errors.push('auditPolicy.requireCore must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      failOn,
      minScore,
      requireCore: requireCoreRaw === undefined ? false : requireCoreRaw,
    },
  };
}
