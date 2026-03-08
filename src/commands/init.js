import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from '../utils/chalk.js';
import { TEMPLATES } from '../utils/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const CWD = process.cwd();

export async function init() {
  const targetDir = path.join(CWD, 'standards');

  console.log(chalk.bold('  Installing ProdReady standards...\n'));

  // Create standards/ directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(chalk.dim('  Created standards/ directory\n'));
  }

  // Write a .prodready version file
  const version = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  ).version;

  fs.writeFileSync(
    path.join(targetDir, '.prodready'),
    JSON.stringify({ version, installedAt: new Date().toISOString() }, null, 2)
  );

  // Copy each template
  let installed = 0;
  let skipped = 0;

  for (const template of TEMPLATES) {
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

  console.log('');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  if (installed > 0) {
    console.log(chalk.green.bold(`  ✓ ${installed} standard${installed === 1 ? '' : 's'} installed to standards/`));
  }
  if (skipped > 0) {
    console.log(chalk.dim(`  ${skipped} already existed and were skipped`));
  }

  console.log('');
  console.log(chalk.bold('  What to do next:'));
  console.log('');
  console.log(`  1. Review the files in ${chalk.cyan('standards/')}`);
  console.log(`  2. Share them with your team and AI coding agents`);
  console.log(`  3. In Cursor or Claude Code, reference them in your system prompt:`);
  console.log('');
  console.log(chalk.dim('     "Follow all rules in the standards/ directory of this project"'));
  console.log('');
  console.log(`  4. Run ${chalk.cyan('npx @chrisadolphus/prodready audit')} to check your compliance score`);
  console.log('');
  console.log(chalk.dim('  Tip: Commit the standards/ directory to version control'));
  console.log(chalk.dim('  so your whole team and all AI agents follow the same rules.'));
  console.log('');
}
