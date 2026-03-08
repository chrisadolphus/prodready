import fs from 'fs';
import path from 'path';
import chalk from '../utils/chalk.js';
import { TEMPLATES } from '../utils/templates.js';

const CWD = process.cwd();

export async function list() {
  const standardsDir = path.join(CWD, 'standards');

  console.log(chalk.bold(`  Available Standards (${TEMPLATES.length} total)\n`));

  for (const template of TEMPLATES) {
    const installed = fs.existsSync(path.join(standardsDir, template.filename));
    const status = installed
      ? chalk.green('  ✓ installed')
      : chalk.dim('  · not installed');

    console.log(`  ${chalk.bold(template.filename.padEnd(22))} ${status}`);
    console.log(chalk.dim(`    ${template.description}`));
    console.log('');
  }

  const installedCount = TEMPLATES.filter(t =>
    fs.existsSync(path.join(standardsDir, t.filename))
  ).length;

  console.log('  ─────────────────────────────────────────');
  console.log('');

  if (installedCount === TEMPLATES.length) {
    console.log(chalk.green(`  ✓ All ${TEMPLATES.length} standards installed.\n`));
  } else if (installedCount === 0) {
    console.log(chalk.dim(`  None installed yet. Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to install all.\n`));
  } else {
    console.log(chalk.dim(`  ${installedCount} of ${TEMPLATES.length} installed. Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to install the rest.\n`));
  }
}
