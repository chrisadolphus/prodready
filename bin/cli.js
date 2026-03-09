#!/usr/bin/env node

import { audit } from '../src/commands/audit.js';
import { init } from '../src/commands/init.js';
import { list } from '../src/commands/list.js';
import { check } from '../src/commands/check.js';
import { parseCliArgs, toBoolean, toNumber } from '../src/utils/args.js';
import { printHelp } from '../src/utils/help.js';
import { printBanner } from '../src/utils/banner.js';

const parsed = parseCliArgs(process.argv.slice(2));
const command = parsed.command;
const options = parsed.options;

printBanner();

switch (command) {
  case 'audit':
    await audit({
      format: options.format,
      failOn: options['fail-on'],
      minScore: toNumber(options['min-score']),
      requireCore: toBoolean(options['require-core']),
      noAdvice: toBoolean(options['no-advice']),
    });
    break;

  case 'init':
    await init({
      only: options.only,
      exclude: options.exclude,
      auto: toBoolean(options.auto),
      yes: toBoolean(options.yes),
    });
    break;

  case 'list':
    await list();
    break;

  case 'check':
    await check();
    break;

  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;

  case undefined:
    printHelp();
    break;

  default:
    console.error(`\nUnknown command: "${command}"\n`);
    printHelp();
    process.exit(1);
}
