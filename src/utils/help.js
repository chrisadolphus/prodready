import chalk from './chalk.js';

export function printHelp() {
  console.log(chalk.bold('  Usage'));
  console.log('');
  console.log(`  ${chalk.green('npx @chrisadolphus/prodready')} ${chalk.cyan('<command>')}`);
  console.log('');
  console.log(chalk.bold('  Commands'));
  console.log('');
  console.log(`  ${chalk.cyan('audit')}    Scan your repo for missing standards and get a score out of 100`);
  console.log(`  ${chalk.cyan('init')}     Drop all production-grade standard templates into your repo`);
  console.log(`  ${chalk.cyan('list')}     Show all available standard templates`);
  console.log(`  ${chalk.cyan('check')}    Check if your installed templates are up to date`);
  console.log(`  ${chalk.cyan('help')}     Show this help message`);
  console.log('');
  console.log(chalk.bold('  Examples'));
  console.log('');
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready audit`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready init`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready list`);
  console.log(`  ${chalk.dim('$')} npx @chrisadolphus/prodready check`);
  console.log('');
  console.log(chalk.dim('  GitHub: https://github.com/chrisadolphus/prodready'));
  console.log('');
}
