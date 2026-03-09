import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from '../utils/chalk.js';
import { detectProjectProfile } from '../utils/detect-project-profile.js';
import { getTemplateById, getTemplateIds, normalizeStandardId, resolveTemplateSelection } from '../utils/standards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const CWD = process.cwd();
const AGENTS_FILE = path.join(CWD, 'AGENTS.md');
const PRODREADY_START = '<!-- PRODREADY:START -->';
const PRODREADY_END = '<!-- PRODREADY:END -->';

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

  console.log('');
  console.log(chalk.bold('  What to do next:'));
  console.log('');
  console.log(`  1. Review the files in ${chalk.cyan('standards/')} and ${chalk.cyan('AGENTS.md')}`);
  console.log('  2. Share them with your team and AI coding agents');
  console.log(`  3. Run ${chalk.cyan('npx @chrisadolphus/prodready audit')} to check your compliance score`);
  console.log('');
  console.log(chalk.dim('  Tip: Commit both standards/ and AGENTS.md to version control'));
  console.log(chalk.dim('  so your whole team and all AI agents follow the same rules.'));
  console.log('');
}
