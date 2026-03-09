import chalk from './chalk.js';

export function printHelp() {
  console.log(chalk.bold('  Usage'));
  console.log('');
  console.log(`  ${chalk.green('npx @chrisadolphus/prodready')} ${chalk.cyan('<command>')} ${chalk.dim('[options]')}`);
  console.log('');
  console.log(chalk.bold('  Commands'));
  console.log('');
  console.log(`  ${chalk.cyan('audit')}    Scan your repo for standards compliance and score`);
  console.log(`           ${chalk.dim('--format text|json --fail-on <low|medium|high|critical|none> --min-score <0-100> --require-core --no-advice')}`);
  console.log(`  ${chalk.cyan('init')}     Install standards templates`);
  console.log(`           ${chalk.dim('--only <csv> --exclude <csv> --auto --yes')}`);
  console.log(`  ${chalk.cyan('list')}     Show all available standard templates`);
  console.log(`  ${chalk.cyan('check')}    Check if your installed templates are up to date`);
  console.log(`  ${chalk.cyan('help')}     Show this help message`);
  console.log('');
  console.log(chalk.bold('  Examples'));
  console.log('');
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready init --auto`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready init --only security,privacy,reliability`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready audit --format json --fail-on high --min-score 85 --require-core`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready audit --no-advice`);
  console.log('');
  console.log(chalk.dim('  GitHub: https://github.com/chrisadolphus/prodready'));
  console.log('');
}
