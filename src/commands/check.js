import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from '../utils/chalk.js';
import { TEMPLATES } from '../utils/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const CWD = process.cwd();

export async function check() {
  const standardsDir = path.join(CWD, 'standards');
  const versionFile = path.join(standardsDir, '.prodready');

  console.log(chalk.bold('  Checking your installed standards...\n'));

  if (!fs.existsSync(standardsDir)) {
    console.log(chalk.yellow('  No standards/ directory found.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to get started.\n`));
    return;
  }

  const currentVersion = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  ).version;

  let installedVersion = null;
  let installedAt = null;

  if (fs.existsSync(versionFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      installedVersion = meta.version;
      installedAt = meta.installedAt;
    } catch {}
  }

  // Check each template
  let upToDate = 0;
  let outdated = 0;
  let missing = 0;

  for (const template of TEMPLATES) {
    const installedPath = path.join(standardsDir, template.filename);
    const sourcePath = path.join(TEMPLATES_DIR, template.filename);

    if (!fs.existsSync(installedPath)) {
      console.log(`  ${chalk.red('✗')} ${template.filename.padEnd(22)} ${chalk.red('missing')}`);
      missing++;
      continue;
    }

    // Compare file sizes as a simple change detection
    const installedStats = fs.statSync(installedPath);
    const sourceStats = fs.existsSync(sourcePath) ? fs.statSync(sourcePath) : null;

    const installedContent = fs.readFileSync(installedPath, 'utf8');
    const sourceContent = sourceStats ? fs.readFileSync(sourcePath, 'utf8') : null;

    if (sourceContent && installedContent !== sourceContent) {
      console.log(`  ${chalk.yellow('⚠')} ${template.filename.padEnd(22)} ${chalk.yellow('outdated')} ${chalk.dim('— newer version available')}`);
      outdated++;
    } else {
      console.log(`  ${chalk.green('✓')} ${template.filename.padEnd(22)} ${chalk.dim('up to date')}`);
      upToDate++;
    }
  }

  console.log('');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  if (installedVersion) {
    console.log(chalk.dim(`  Installed version: ${installedVersion}`));
    console.log(chalk.dim(`  Current version:   ${currentVersion}`));
    if (installedAt) {
      const date = new Date(installedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      console.log(chalk.dim(`  Installed on:      ${date}`));
    }
    console.log('');
  }

  if (missing === 0 && outdated === 0) {
    console.log(chalk.green.bold(`  ✓ All standards are up to date.\n`));
  } else {
    if (outdated > 0) {
      console.log(chalk.yellow(`  ${outdated} standard${outdated === 1 ? '' : 's'} can be updated.`));
    }
    if (missing > 0) {
      console.log(chalk.red(`  ${missing} standard${missing === 1 ? '' : 's'} missing.`));
    }
    console.log('');
    console.log(chalk.dim(`  Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to install missing standards.`));
    console.log(chalk.dim(`  To update outdated files, delete them and run init again.\n`));
  }
}
