import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from '../utils/chalk.js';
import { detectProjectProfile } from '../utils/detect-project-profile.js';
import { getTemplateById, getTemplateIds, normalizeStandardId, resolveTemplateSelection } from '../utils/standards.js';
import { getProdreadyConfigPath, readProdreadyConfig, validateAuditPolicy } from '../utils/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const CWD = process.cwd();
const AGENTS_FILE = path.join(CWD, 'AGENTS.md');
const PRODREADY_START = '<!-- PRODREADY:START -->';
const PRODREADY_END = '<!-- PRODREADY:END -->';
const CI_MARKER_START = '# PRODREADY:START';
const CI_MARKER_END = '# PRODREADY:END';
const WORKFLOW_CANDIDATES = [
  path.join(CWD, '.github/workflows/ci.yml'),
  path.join(CWD, '.github/workflows/ci.yaml'),
];
const DEFAULT_AUDIT_POLICY = {
  failOn: 'high',
  minScore: 85,
  requireCore: true,
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderAgentsBlock(selectedStandards) {
  const lines = [
    PRODREADY_START,
    '## ProdReady',
    '',
    'Follow all rules in the `standards/` directory of this project.',
    '',
    'The active ProdReady profile for this repository includes these standards:',
    ...selectedStandards.map((id) => `- ${id}`),
    PRODREADY_END,
  ];

  return `${lines.join('\n')}\n`;
}

function updateAgentsFile(selectedStandards) {
  const block = renderAgentsBlock(selectedStandards);

  if (!fs.existsSync(AGENTS_FILE)) {
    fs.writeFileSync(AGENTS_FILE, block);
    return { action: 'created' };
  }

  const current = fs.readFileSync(AGENTS_FILE, 'utf8');
  const managedPattern = new RegExp(`${escapeRegExp(PRODREADY_START)}[\\s\\S]*?${escapeRegExp(PRODREADY_END)}\\n?`, 'm');
  let next = current;

  if (current.includes(PRODREADY_START) && current.includes(PRODREADY_END)) {
    next = current.replace(managedPattern, block);
  } else {
    const separator = current.length === 0 ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
    next = `${current}${separator}${block}`;
  }

  if (next === current) {
    return { action: 'unchanged' };
  }

  fs.writeFileSync(AGENTS_FILE, next);
  return { action: 'updated' };
}

function validateProdreadyConfigForInit() {
  const existing = readProdreadyConfig(CWD);
  const configPath = getProdreadyConfigPath(CWD);

  if (existing.error === 'invalid-json') {
    return {
      ok: false,
      error: `Invalid ${path.basename(configPath)}: expected valid JSON.`,
    };
  }

  if (!existing.exists) {
    return { ok: true };
  }

  const auditPolicyValidation = validateAuditPolicy(existing.data?.auditPolicy);
  if (!auditPolicyValidation.valid) {
    return {
      ok: false,
      error: `Invalid ${path.basename(configPath)} auditPolicy: ${auditPolicyValidation.errors.join('; ')}`,
    };
  }

  return { ok: true };
}

function ensureProdreadyConfigFile() {
  const existing = readProdreadyConfig(CWD);
  const configPath = getProdreadyConfigPath(CWD);

  if (existing.error === 'invalid-json') {
    return {
      ok: false,
      error: `Invalid ${path.basename(configPath)}: expected valid JSON.`,
    };
  }

  if (!existing.exists) {
    const created = { auditPolicy: DEFAULT_AUDIT_POLICY };
    fs.writeFileSync(configPath, `${JSON.stringify(created, null, 2)}\n`);
    return { ok: true, action: 'created' };
  }

  const auditPolicyValidation = validateAuditPolicy(existing.data?.auditPolicy);
  if (!auditPolicyValidation.valid) {
    return {
      ok: false,
      error: `Invalid ${path.basename(configPath)} auditPolicy: ${auditPolicyValidation.errors.join('; ')}`,
    };
  }

  const currentPolicy =
    existing.data?.auditPolicy && typeof existing.data.auditPolicy === 'object' && !Array.isArray(existing.data.auditPolicy)
      ? existing.data.auditPolicy
      : {};
  const mergedPolicy = {
    ...DEFAULT_AUDIT_POLICY,
    ...currentPolicy,
  };

  const nextConfig = {
    ...existing.data,
    auditPolicy: mergedPolicy,
  };

  if (JSON.stringify(nextConfig) === JSON.stringify(existing.data)) {
    return { ok: true, action: 'unchanged' };
  }

  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  return { ok: true, action: 'updated' };
}

function buildCiManagedBlock(indent) {
  const inner = `${indent}  `;
  return [
    `${indent}${CI_MARKER_START}`,
    `${indent}- name: ProdReady policy audit`,
    `${inner}run: npx @chrisadolphus/prodready audit`,
    `${indent}${CI_MARKER_END}`,
  ];
}

function hasExistingAuditStep(lines, stepsIdx, stepsIndent) {
  const itemIndentLength = stepsIndent.length + 2;
  const inlineAuditPattern = /(?:^|\s)(?:npx\s+@chrisadolphus\/prodready|node\s+bin\/cli\.js)\s+audit(?:\s|$)/;

  for (let i = stepsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const currentIndent = line.match(/^\s*/)[0];
    if (currentIndent.length <= stepsIndent.length) break;

    if (currentIndent.length < itemIndentLength) continue;

    const runMatch = line.match(/^\s*run:\s*(.*)$/);
    if (!runMatch) continue;

    const runValue = runMatch[1].trim();
    if (runValue && !runValue.startsWith('|') && !runValue.startsWith('>')) {
      if (inlineAuditPattern.test(runValue)) return true;
      continue;
    }

    const runIndentLength = currentIndent.length;
    for (let j = i + 1; j < lines.length; j++) {
      const cmdLine = lines[j];
      if (cmdLine.trim() === '') continue;

      const cmdIndent = cmdLine.match(/^\s*/)[0];
      if (cmdIndent.length <= runIndentLength) {
        i = j - 1;
        break;
      }

      if (inlineAuditPattern.test(cmdLine.trim())) return true;

      if (j === lines.length - 1) {
        i = j;
      }
    }
  }

  return false;
}

function findStepsBlocks(lines) {
  const indices = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*steps:\s*$/.test(lines[i])) {
      indices.push(i);
    }
  }
  return indices;
}

function updateWorkflowFile(content) {
  const lines = content.split('\n');
  const markerStartIdx = lines.findIndex((line) => line.trim() === CI_MARKER_START);
  const markerEndIdx = lines.findIndex((line, index) => index > markerStartIdx && line.trim() === CI_MARKER_END);

  if (markerStartIdx !== -1) {
    if (markerEndIdx === -1) {
      return { ok: false, reason: 'invalid-managed-block' };
    }
    const indent = lines[markerStartIdx].match(/^\s*/)[0];
    const replacement = buildCiManagedBlock(indent);
    const next = [...lines.slice(0, markerStartIdx), ...replacement, ...lines.slice(markerEndIdx + 1)].join('\n');
    return {
      ok: true,
      changed: next !== content,
      content: next,
      action: next !== content ? 'updated' : 'unchanged',
    };
  }

  const stepsBlocks = findStepsBlocks(lines);
  if (stepsBlocks.length === 0) {
    return { ok: false, reason: 'steps-not-found' };
  }

  // If any workflow job already has a ProdReady audit invocation, avoid duplicating steps.
  const existingAudit = stepsBlocks.some((index) => {
    const indent = lines[index].match(/^\s*/)[0];
    return hasExistingAuditStep(lines, index, indent);
  });
  if (existingAudit) {
    return {
      ok: true,
      changed: false,
      content,
      action: 'existing-audit',
    };
  }

  const stepsIdx = stepsBlocks[0];
  const stepsIndent = lines[stepsIdx].match(/^\s*/)[0];
  const itemIndent = `${stepsIndent}  `;
  let insertAt = lines.length;
  for (let i = stepsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const currentIndent = line.match(/^\s*/)[0];
    if (currentIndent.length <= stepsIndent.length) {
      insertAt = i;
      break;
    }
  }

  const block = buildCiManagedBlock(itemIndent);
  const prefix = lines.slice(0, insertAt);
  const suffix = lines.slice(insertAt);
  if (prefix.length > 0 && prefix[prefix.length - 1].trim() !== '') {
    prefix.push('');
  }

  const nextLines = [...prefix, ...block, ...suffix];
  return {
    ok: true,
    changed: true,
    content: nextLines.join('\n'),
    action: 'updated',
  };
}

function updateCiWorkflow() {
  const workflowPath = WORKFLOW_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!workflowPath) {
    return { action: 'missing' };
  }

  const current = fs.readFileSync(workflowPath, 'utf8');
  const result = updateWorkflowFile(current);
  if (!result.ok) {
    return { action: 'unsupported', reason: result.reason };
  }

  if (!result.changed) {
    return { action: result.action || 'unchanged', path: workflowPath };
  }

  fs.writeFileSync(workflowPath, result.content);
  return { action: result.action, path: workflowPath };
}

function normalizeSelectionOptions(options) {
  const onlyTokens = String(options.only || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const excludeTokens = String(options.exclude || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const only = [];
  const exclude = [];
  const unknown = [];

  for (const token of onlyTokens) {
    const normalized = normalizeStandardId(token);
    if (!normalized) unknown.push(token);
    else only.push(normalized);
  }

  for (const token of excludeTokens) {
    const normalized = normalizeStandardId(token);
    if (!normalized) unknown.push(token);
    else exclude.push(normalized);
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown standard id(s): ${[...new Set(unknown)].join(', ')}. Valid ids: ${getTemplateIds().join(', ')}`,
    };
  }

  return {
    ok: true,
    only,
    exclude,
  };
}

export async function init(options = {}) {
  const targetDir = path.join(CWD, 'standards');

  console.log(chalk.bold('  Installing ProdReady standards...\n'));

  const normalized = normalizeSelectionOptions(options);
  if (!normalized.ok) {
    console.error(chalk.red(`  ${normalized.error}\n`));
    process.exitCode = 1;
    return;
  }

  // Fail fast before mutating standards/, AGENTS.md, or workflow files.
  const preflightConfig = validateProdreadyConfigForInit();
  if (!preflightConfig.ok) {
    console.error(chalk.red(`  ${preflightConfig.error}\n`));
    process.exitCode = 1;
    return;
  }

  const autoProfile = options.auto ? detectProjectProfile(CWD) : null;
  const selection = resolveTemplateSelection({
    only: normalized.only,
    exclude: normalized.exclude,
    auto: autoProfile ? autoProfile.selectedStandards : null,
  });

  if (!selection.ok) {
    console.error(chalk.red(`  ${selection.error}\n`));
    process.exitCode = 1;
    return;
  }

  const selectedTemplates = selection.selected.map((id) => getTemplateById(id));

  if (autoProfile) {
    console.log(chalk.bold('  Auto-detected standards profile:'));
    console.log(chalk.dim(`  Selected: ${selection.selected.join(', ')}`));
    if (selection.excluded.length > 0) {
      console.log(chalk.dim(`  Excluded: ${selection.excluded.join(', ')}`));
    }
    console.log('');
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(chalk.dim('  Created standards/ directory\n'));
  }

  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).version;

  fs.writeFileSync(
    path.join(targetDir, '.prodready'),
    JSON.stringify(
      {
        version,
        installedAt: new Date().toISOString(),
        selectedStandards: selection.selected,
        excludedStandards: selection.excluded,
        mode: options.auto ? 'auto' : normalized.only.length > 0 ? 'only' : normalized.exclude.length > 0 ? 'exclude' : 'all',
      },
      null,
      2
    )
  );

  let installed = 0;
  let skipped = 0;

  for (const template of selectedTemplates) {
    const src = path.join(TEMPLATES_DIR, template.filename);
    const dest = path.join(targetDir, template.filename);

    if (!fs.existsSync(src)) {
      console.log(chalk.yellow(`  ⚠ Template not found: ${template.filename}`));
      continue;
    }

    if (fs.existsSync(dest)) {
      console.log(`  ${chalk.dim('↓')} ${chalk.dim(template.filename)} ${chalk.dim('(already exists, skipped)')}`);
      skipped++;
      continue;
    }

    fs.copyFileSync(src, dest);
    console.log(`  ${chalk.green('✓')} ${chalk.white(template.filename)} ${chalk.dim('— ' + template.title)}`);
    installed++;
  }

  const agentsResult = updateAgentsFile(selection.selected);
  const configResult = ensureProdreadyConfigFile();
  if (!configResult.ok) {
    console.error(chalk.red(`  ${configResult.error}\n`));
    process.exitCode = 1;
    return;
  }
  const ciResult = updateCiWorkflow();

  console.log('');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  if (installed > 0) {
    console.log(chalk.green.bold(`  ✓ ${installed} standard${installed === 1 ? '' : 's'} installed to standards/`));
  }
  if (skipped > 0) {
    console.log(chalk.dim(`  ${skipped} already existed and were skipped`));
  }

  if (selection.excluded.length > 0) {
    console.log(chalk.dim(`  Profile excludes: ${selection.excluded.join(', ')}`));
  }

  if (agentsResult.action === 'created') {
    console.log(chalk.green(`  ✓ AGENTS.md created with ProdReady instructions`));
  } else if (agentsResult.action === 'updated') {
    console.log(chalk.green(`  ✓ AGENTS.md updated with the active standards profile`));
  } else {
    console.log(chalk.dim(`  AGENTS.md already reflected the active standards profile`));
  }

  if (configResult.action === 'created') {
    console.log(chalk.green(`  ✓ prodready.json created with default audit policy (high/85/require-core)`));
  } else if (configResult.action === 'updated') {
    console.log(chalk.green(`  ✓ prodready.json updated with missing default audit policy keys`));
  } else {
    console.log(chalk.dim(`  prodready.json already reflected the audit policy defaults`));
  }

  if (ciResult.action === 'updated') {
    const relativePath = path.relative(CWD, ciResult.path);
    console.log(chalk.green(`  ✓ ${relativePath} updated with a managed ProdReady audit step`));
  } else if (ciResult.action === 'existing-audit') {
    const relativePath = path.relative(CWD, ciResult.path);
    console.log(chalk.dim(`  ${relativePath} already includes an audit step; skipped managed block insertion`));
  } else if (ciResult.action === 'unchanged') {
    const relativePath = path.relative(CWD, ciResult.path);
    console.log(chalk.dim(`  ${relativePath} already included the managed ProdReady audit step`));
  } else if (ciResult.action === 'missing') {
    console.log(chalk.dim('  No .github/workflows/ci.yml|ci.yaml found; add an audit step to your CI manually'));
  } else {
    const target = WORKFLOW_CANDIDATES.find((candidate) => fs.existsSync(candidate));
    const relativePath = target ? path.relative(CWD, target) : '.github/workflows/ci.yml';
    console.log(chalk.yellow(`  Could not safely update ${relativePath}; add a ProdReady audit step manually`));
  }

  console.log('');
  console.log(chalk.bold('  What to do next:'));
  console.log('');
  console.log(`  1. Review the files in ${chalk.cyan('standards/')}, ${chalk.cyan('AGENTS.md')}, and ${chalk.cyan('prodready.json')}`);
  console.log('  2. Share them with your team and AI coding agents');
  console.log(`  3. Run ${chalk.cyan('npx @chrisadolphus/prodready audit')} to check your compliance score`);
  console.log('');
  console.log(chalk.dim('  Tip: Commit standards/, AGENTS.md, and prodready.json to version control'));
  console.log(chalk.dim('  so your team, AI agents, and CI use the same policy.'));
  console.log('');
}
