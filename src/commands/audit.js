import fs from 'fs';
import path from 'path';
import chalk from '../utils/chalk.js';
import { TEMPLATES, TOTAL_WEIGHT } from '../utils/templates.js';

const CWD = process.cwd();

// ─── File helpers ────────────────────────────────────────────────────────────

function fileExists(filename) {
  return fs.existsSync(path.join(CWD, filename));
}

function readFile(filename) {
  const filepath = path.join(CWD, filename);
  if (!fs.existsSync(filepath)) return '';
  return fs.readFileSync(filepath, 'utf8');
}

function getAllFiles(dir, exts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rb'], result = []) {
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv'];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        getAllFiles(path.join(dir, entry.name), exts, result);
      }
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      result.push(path.join(dir, entry.name));
    }
  }
  return result;
}

function searchInFiles(files, patterns) {
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(content)) return true;
      }
    } catch {}
  }
  return false;
}

function searchAllFiles(files, pattern) {
  const matches = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          matches.push({ file: path.relative(CWD, file), line: i + 1, content: line.trim() });
        }
      });
    } catch {}
  }
  return matches;
}

// ─── Individual checks ───────────────────────────────────────────────────────

function checkNoHardcodedSecrets(files) {
  const secretPatterns = [
    /sk_live_[a-zA-Z0-9]{20,}/,
    /sk_test_[a-zA-Z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[a-zA-Z0-9]{36}/,
    /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/,
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    /password\s*=\s*["'][^"']{6,}["']/i,
    /api_key\s*=\s*["'][^"']{8,}["']/i,
    /secret\s*=\s*["'][^"']{8,}["']/i,
  ];

  const sourceFiles = files.filter(f =>
    !f.includes('.env') &&
    !f.includes('test') &&
    !f.includes('spec') &&
    !f.includes('.example')
  );

  const matches = [];
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (secretPatterns.some(p => p.test(line)) && !line.trim().startsWith('//') && !line.trim().startsWith('#')) {
          matches.push({ file: path.relative(CWD, file), line: i + 1 });
        }
      });
    } catch {}
  }
  return { pass: matches.length === 0, matches };
}

function checkEnvInGitignore() {
  const gitignore = readFile('.gitignore');
  return gitignore.includes('.env');
}

function checkInputValidation(files) {
  return searchInFiles(files, [/zod|joi|yup|pydantic|marshmallow|cerberus|class-validator/i]);
}

function checkRateLimiting(files) {
  return searchInFiles(files, [/rate.?limit|ratelimit|slowapi|express-rate-limit|upstash.*ratelimit/i]);
}

function checkSecurityHeaders(files) {
  return searchInFiles(files, [/helmet|csp|content.security.policy|x-frame-options|strict.transport/i]);
}

function checkPasswordHashing(files) {
  return searchInFiles(files, [/bcrypt|argon2|scrypt/i]);
}

function checkNoPlainPasswords(files) {
  const dangerous = searchAllFiles(files, /password.*=.*["'][^"']{3,}["'](?!\s*\/\/)/i)
    .filter(m => !m.content.includes('bcrypt') && !m.content.includes('hash') && !m.content.includes('env') && !m.content.includes('process.'));
  return { pass: dangerous.length === 0, matches: dangerous };
}

function checkJwtSecret(files) {
  const hardcoded = searchAllFiles(files, /jwt.*secret.*=.*["'][^"']{8,}["']/i)
    .filter(m => !m.content.includes('process.env') && !m.content.includes('os.environ'));
  return { pass: hardcoded.length === 0, matches: hardcoded };
}

function checkNoCardStorage(files) {
  const dangerous = searchAllFiles(files, /card.?number|cardnumber|pan\b|cvv|cvc/i)
    .filter(m => !m.content.trim().startsWith('//') && !m.content.trim().startsWith('#') && !m.content.toLowerCase().includes('never'));
  return { pass: dangerous.length === 0, matches: dangerous };
}

function checkWebhookVerification(files) {
  return searchInFiles(files, [/constructEvent|webhook.*secret|stripe.*verify|verif.*webhook/i]);
}

function checkErrorMonitoring(files) {
  const pkgJson = readFile('package.json');
  const requirementsTxt = readFile('requirements.txt');
  return (
    pkgJson.includes('@sentry') ||
    pkgJson.includes('sentry') ||
    pkgJson.includes('highlight.run') ||
    pkgJson.includes('@highlight-run') ||
    requirementsTxt.includes('sentry') ||
    searchInFiles(files, [/Sentry\.init|sentry\.init|highlight\.init/i])
  );
}

function checkHealthEndpoint(files) {
  return searchInFiles(files, [/\/health|health.?check|healthcheck/i]);
}

function checkEnvExample() {
  return fileExists('.env.example') || fileExists('.env.sample') || fileExists('.env.template');
}

function checkNoOutlineNone(files) {
  const cssFiles = getAllFiles(CWD, ['.css', '.scss', '.sass', '.less', '.module.css']);
  const styleMatches = searchAllFiles(cssFiles, /outline\s*:\s*none|outline\s*:\s*0/i)
    .filter(m => !m.content.includes('focus-visible') && !m.content.includes('/* '));
  const jsMatches = searchAllFiles(files, /outline.*none|outlineStyle.*none/i)
    .filter(m => !m.content.trim().startsWith('//'));
  return { pass: styleMatches.length === 0 && jsMatches.length === 0, matches: [...styleMatches, ...jsMatches] };
}

function checkSemanticHtml(files) {
  const htmlFiles = getAllFiles(CWD, ['.html', '.jsx', '.tsx', '.vue', '.svelte']);
  return searchInFiles(htmlFiles, /<nav|<main|<header|<footer|<article|<aside|<section/i);
}

function checkLoadingStates(files) {
  const uiFiles = getAllFiles(CWD, ['.jsx', '.tsx', '.vue', '.svelte']);
  return searchInFiles(uiFiles, /isLoading|loading|isPending|isFetching|skeleton|Spinner/i);
}

function checkErrorBoundaries(files) {
  const reactFiles = getAllFiles(CWD, ['.jsx', '.tsx']);
  if (reactFiles.length === 0) return true; // Not a React project
  return searchInFiles(reactFiles, /ErrorBoundary|error.?boundary|componentDidCatch/i);
}

function checkApiVersioning(files) {
  return searchInFiles(files, [/\/api\/v\d|app\.use.*\/v\d|router.*\/v\d/i]);
}

function checkPagination(files) {
  return searchInFiles(files, [/pagination|paginate|cursor|offset.*limit|take.*skip|per_page|pageSize/i]);
}

function checkNoPasswordsInEmail(files) {
  const emailFiles = files.filter(f => f.toLowerCase().includes('email') || f.toLowerCase().includes('mail') || f.toLowerCase().includes('notification'));
  if (emailFiles.length === 0) return true;
  const matches = searchAllFiles(emailFiles, /password.*email|email.*password|send.*password/i)
    .filter(m => !m.content.trim().startsWith('//') && !m.content.toLowerCase().includes('reset'));
  return { pass: matches.length === 0, matches };
}

function checkEmailProvider(files) {
  const pkgJson = readFile('package.json');
  const requirementsTxt = readFile('requirements.txt');
  return (
    pkgJson.includes('resend') ||
    pkgJson.includes('@sendgrid') ||
    pkgJson.includes('postmark') ||
    pkgJson.includes('nodemailer') ||
    pkgJson.includes('@aws-sdk/client-ses') ||
    requirementsTxt.includes('sendgrid') ||
    requirementsTxt.includes('mailgun') ||
    searchInFiles(files, [/resend|sendgrid|postmark|mailgun|nodemailer|ses/i])
  );
}

function checkReadme() {
  return fileExists('README.md') || fileExists('readme.md');
}

function checkChangelog() {
  return fileExists('CHANGELOG.md') || fileExists('changelog.md') || fileExists('CHANGELOG');
}

function checkNoPiiInLogs(files) {
  const dangerous = searchAllFiles(files, /console\.log.*email|log.*\.email|logger.*email|log.*password|console\.log.*password/i)
    .filter(m => !m.content.trim().startsWith('//'));
  return { pass: dangerous.length === 0, matches: dangerous };
}

// ─── Run all checks ──────────────────────────────────────────────────────────

function runChecks(files) {
  const results = [];

  // Security
  const secretsCheck = checkNoHardcodedSecrets(files);
  results.push({ id: 'no-hardcoded-secrets', category: 'Security', label: 'No hardcoded secrets detected', weight: 15, pass: secretsCheck.pass, issues: secretsCheck.matches });
  results.push({ id: 'env-gitignore', category: 'Security', label: '.env excluded from git', weight: 10, pass: checkEnvInGitignore() });
  results.push({ id: 'input-validation', category: 'Security', label: 'Input validation library used', weight: 10, pass: checkInputValidation(files) });
  results.push({ id: 'rate-limiting', category: 'Security', label: 'Rate limiting configured', weight: 10, pass: checkRateLimiting(files) });
  results.push({ id: 'security-headers', category: 'Security', label: 'Security headers configured', weight: 5, pass: checkSecurityHeaders(files) });

  // Privacy
  const piiCheck = checkNoPiiInLogs(files);
  results.push({ id: 'no-pii-logs', category: 'Privacy', label: 'No PII in log statements', weight: 10, pass: piiCheck.pass, issues: piiCheck.matches });
  results.push({ id: 'privacy-policy', category: 'Privacy', label: 'Privacy policy exists', weight: 5, pass: fileExists('PRIVACY.md') || fileExists('privacy-policy.md') });

  // Authentication
  results.push({ id: 'password-hashing', category: 'Authentication', label: 'Secure password hashing used (bcrypt/argon2)', weight: 15, pass: checkPasswordHashing(files) });
  const plainPwdCheck = checkNoPlainPasswords(files);
  results.push({ id: 'no-plain-passwords', category: 'Authentication', label: 'No plain text passwords in code', weight: 15, pass: plainPwdCheck.pass, issues: plainPwdCheck.matches });
  const jwtCheck = checkJwtSecret(files);
  results.push({ id: 'jwt-secret', category: 'Authentication', label: 'JWT secret not hardcoded', weight: 10, pass: jwtCheck.pass, issues: jwtCheck.matches });

  // Payments
  const cardCheck = checkNoCardStorage(files);
  results.push({ id: 'no-card-storage', category: 'Payments', label: 'No card numbers in codebase', weight: 15, pass: cardCheck.pass, issues: cardCheck.matches });
  results.push({ id: 'webhook-verification', category: 'Payments', label: 'Webhook signature verification present', weight: 10, pass: checkWebhookVerification(files) });

  // Reliability
  results.push({ id: 'error-monitoring', category: 'Reliability', label: 'Error monitoring configured', weight: 10, pass: checkErrorMonitoring(files) });
  results.push({ id: 'health-endpoint', category: 'Reliability', label: 'Health check endpoint exists', weight: 5, pass: checkHealthEndpoint(files) });
  results.push({ id: 'env-example', category: 'Reliability', label: '.env.example file exists', weight: 5, pass: checkEnvExample() });

  // Accessibility
  const outlineCheck = checkNoOutlineNone(files);
  results.push({ id: 'no-outline-none', category: 'Accessibility', label: 'No outline: none without replacement', weight: 5, pass: outlineCheck.pass, issues: outlineCheck.matches });
  results.push({ id: 'semantic-html', category: 'Accessibility', label: 'Semantic HTML elements used', weight: 5, pass: checkSemanticHtml(files) });

  // UX States
  results.push({ id: 'loading-states', category: 'UX States', label: 'Loading state patterns present', weight: 5, pass: checkLoadingStates(files) });
  results.push({ id: 'error-boundaries', category: 'UX States', label: 'Error boundaries implemented', weight: 5, pass: checkErrorBoundaries(files) });

  // API Design
  results.push({ id: 'api-versioning', category: 'API Design', label: 'API routes include version prefix', weight: 5, pass: checkApiVersioning(files) });
  results.push({ id: 'pagination', category: 'API Design', label: 'Pagination implemented on list endpoints', weight: 5, pass: checkPagination(files) });

  // Email
  const emailPwdCheck = checkNoPasswordsInEmail(files);
  results.push({ id: 'no-passwords-in-email', category: 'Email', label: 'No passwords sent in email body', weight: 5, pass: typeof emailPwdCheck === 'boolean' ? emailPwdCheck : emailPwdCheck.pass, issues: typeof emailPwdCheck === 'object' ? emailPwdCheck.matches : [] });
  results.push({ id: 'email-provider', category: 'Email', label: 'Email sending service configured', weight: 5, pass: checkEmailProvider(files) });

  // Documentation
  results.push({ id: 'readme', category: 'Documentation', label: 'README.md exists', weight: 5, pass: checkReadme() });
  results.push({ id: 'env-example-docs', category: 'Documentation', label: '.env.example exists', weight: 5, pass: checkEnvExample() });
  results.push({ id: 'changelog', category: 'Documentation', label: 'CHANGELOG.md exists', weight: 5, pass: checkChangelog() });

  return results;
}

// ─── Main audit function ─────────────────────────────────────────────────────

export async function audit() {
  console.log(chalk.bold('  Scanning your repository...\n'));

  const files = getAllFiles(CWD);

  if (files.length === 0) {
    console.log(chalk.yellow('  No source files found. Make sure you are running this from your project root.\n'));
    return;
  }

  console.log(chalk.dim(`  Found ${files.length} source files to scan.\n`));

  const results = runChecks(files);

  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const passedWeight = results.filter(r => r.pass).reduce((sum, r) => sum + r.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  // Group by category
  const categories = {};
  for (const result of results) {
    if (!categories[result.category]) categories[result.category] = [];
    categories[result.category].push(result);
  }

  // Print results by category
  for (const [category, checks] of Object.entries(categories)) {
    const allPass = checks.every(c => c.pass);
    const categoryIcon = allPass ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${categoryIcon} ${chalk.bold(category)}`);

    for (const check of checks) {
      const icon = check.pass ? chalk.green('  ✓') : chalk.red('  ✗');
      const label = check.pass ? chalk.dim(check.label) : chalk.white(check.label);
      const weight = check.pass ? '' : chalk.dim(` [-${check.weight}pts]`);
      console.log(`${icon} ${label}${weight}`);

      if (!check.pass && check.issues && check.issues.length > 0) {
        const shown = check.issues.slice(0, 3);
        for (const issue of shown) {
          console.log(chalk.dim(`       → ${issue.file}${issue.line ? `:${issue.line}` : ''}`));
        }
        if (check.issues.length > 3) {
          console.log(chalk.dim(`       → ...and ${check.issues.length - 3} more`));
        }
      }
    }
    console.log('');
  }

  // Score display
  const scoreColor = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  const scoreBar = buildScoreBar(score);

  console.log('  ─────────────────────────────────────────');
  console.log('');
  console.log(`  Security Score: ${scoreColor.bold(score + ' / 100')}  ${scoreBar}`);
  console.log('');

  if (score === 100) {
    console.log(chalk.green.bold('  ✓ Your repo meets all production standards. Ship with confidence.\n'));
  } else if (score >= 80) {
    const failed = results.filter(r => !r.pass).length;
    console.log(chalk.yellow(`  ${failed} issue${failed === 1 ? '' : 's'} to fix before you ship.\n`));
  } else if (score >= 50) {
    const failed = results.filter(r => !r.pass).length;
    console.log(chalk.yellow(`  ${failed} issues found. Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to add the missing standards.\n`));
  } else {
    console.log(chalk.red(`  Critical issues found. Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to get started.\n`));
  }

  // Suggest init if templates are missing
  const templateFiles = TEMPLATES.map(t => t.filename);
  const missingTemplates = templateFiles.filter(f => !fileExists(`standards/${f}`) && !fileExists(f));
  if (missingTemplates.length > 0) {
    console.log(chalk.dim(`  Tip: Run ${chalk.cyan('npx @chrisadolphus/prodready init')} to add ${missingTemplates.length} missing standard${missingTemplates.length === 1 ? '' : 's'} to your repo.\n`));
  }
}

function buildScoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `[${bar}]`;
}
