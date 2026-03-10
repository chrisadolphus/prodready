import fs from 'fs';
import path from 'path';
import chalk from '../utils/chalk.js';
import { TEMPLATES } from '../utils/templates.js';
import { CORE_STANDARD_IDS, getTemplateIds, inferInstalledStandards, readInstalledProfile } from '../utils/standards.js';
import { getValidSeverities, loadRules, normalizeSeverity, severityRank } from '../utils/rules.js';
import { readProdreadyConfig, validateAuditPolicy } from '../utils/config.js';

const CWD = process.cwd();
const SOURCE_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rb'];
const UI_EXTS = ['.jsx', '.tsx', '.vue', '.svelte'];
const CSS_EXTS = ['.css', '.scss', '.sass', '.less', '.module.css'];
const HTML_EXTS = ['.html', '.jsx', '.tsx', '.vue', '.svelte'];
const MAX_FILE_BYTES = 1024 * 1024;

function fileExists(filename) {
  return fs.existsSync(path.join(CWD, filename));
}

function readFile(filename) {
  const filepath = path.join(CWD, filename);
  if (!fs.existsSync(filepath)) return '';
  return fs.readFileSync(filepath, 'utf8');
}

function isLikelyBinary(buffer) {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function getAllFiles(dir, exts = SOURCE_EXTS, result = []) {
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', '.cache', 'coverage'];
  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        getAllFiles(path.join(dir, entry.name), exts, result);
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      const filePath = path.join(dir, entry.name);
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_BYTES) continue;
        const fd = fs.openSync(filePath, 'r');
        const sample = Buffer.alloc(Math.min(stats.size, 512));
        fs.readSync(fd, sample, 0, sample.length, 0);
        fs.closeSync(fd);
        if (isLikelyBinary(sample)) continue;
      } catch {
        continue;
      }
      result.push(filePath);
    }
  }

  return result;
}

function redactSecrets(text) {
  if (!text) return text;
  return text
    .replace(/(sk_live_|sk_test_)[a-zA-Z0-9]{8,}/g, '$1[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA[REDACTED]')
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, 'ghp_[REDACTED]')
    .replace(/(password\s*=\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2')
    .replace(/(secret\s*=\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2')
    .replace(/(api[_-]?key\s*=\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
}

function searchInFiles(files, patterns) {
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(content)) return true;
      }
    } catch {
      // Ignore unreadable files.
    }
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
          matches.push({
            file: path.relative(CWD, file),
            line: i + 1,
            content: redactSecrets(line.trim()),
          });
        }
      });
    } catch {
      // Ignore unreadable files.
    }
  }
  return matches;
}

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

  const sourceFiles = files.filter((f) => !f.includes('.env') && !f.includes('test') && !f.includes('spec') && !f.includes('.example'));

  const matches = [];
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (secretPatterns.some((p) => p.test(line)) && !line.trim().startsWith('//') && !line.trim().startsWith('#')) {
          matches.push({ file: path.relative(CWD, file), line: i + 1, content: redactSecrets(line.trim()) });
        }
      });
    } catch {
      // Ignore unreadable files.
    }
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
  const dangerous = searchAllFiles(files, /password.*=.*["'][^"']{3,}["'](?!\s*\/\/)/i).filter(
    (m) => !m.content.includes('bcrypt') && !m.content.includes('hash') && !m.content.includes('env') && !m.content.includes('process.')
  );
  return { pass: dangerous.length === 0, matches: dangerous };
}

function checkJwtSecret(files) {
  const hardcoded = searchAllFiles(files, /jwt.*secret.*=.*["'][^"']{8,}["']/i).filter(
    (m) => !m.content.includes('process.env') && !m.content.includes('os.environ')
  );
  return { pass: hardcoded.length === 0, matches: hardcoded };
}

function checkNoCardStorage(files) {
  const dangerous = searchAllFiles(files, /card.?number|cardnumber|pan\b|cvv|cvc/i).filter(
    (m) => !m.content.trim().startsWith('//') && !m.content.trim().startsWith('#') && !m.content.toLowerCase().includes('never')
  );
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
  const cssFiles = getAllFiles(CWD, CSS_EXTS);
  const styleMatches = searchAllFiles(cssFiles, /outline\s*:\s*none|outline\s*:\s*0/i).filter(
    (m) => !m.content.includes('focus-visible') && !m.content.includes('/* ')
  );
  const jsMatches = searchAllFiles(files, /outline.*none|outlineStyle.*none/i).filter((m) => !m.content.trim().startsWith('//'));
  return { pass: styleMatches.length === 0 && jsMatches.length === 0, matches: [...styleMatches, ...jsMatches] };
}

function checkSemanticHtml() {
  const htmlFiles = getAllFiles(CWD, HTML_EXTS);
  return searchInFiles(htmlFiles, [/<nav|<main|<header|<footer|<article|<aside|<section/i]);
}

function checkLoadingStates() {
  const uiFiles = getAllFiles(CWD, UI_EXTS);
  return searchInFiles(uiFiles, [/isLoading|loading|isPending|isFetching|skeleton|Spinner/i]);
}

function checkErrorBoundaries() {
  const reactFiles = getAllFiles(CWD, ['.jsx', '.tsx']);
  if (reactFiles.length === 0) return true;
  return searchInFiles(reactFiles, [/ErrorBoundary|error.?boundary|componentDidCatch/i]);
}

function checkApiVersioning(files) {
  return searchInFiles(files, [/\/api\/v\d|app\.use.*\/v\d|router.*\/v\d/i]);
}

function checkPagination(files) {
  return searchInFiles(files, [/pagination|paginate|cursor|offset.*limit|take.*skip|per_page|pageSize/i]);
}

function checkNoPasswordsInEmail(files) {
  const emailFiles = files.filter(
    (f) => f.toLowerCase().includes('email') || f.toLowerCase().includes('mail') || f.toLowerCase().includes('notification')
  );
  if (emailFiles.length === 0) return true;
  const matches = searchAllFiles(emailFiles, /password.*email|email.*password|send.*password/i).filter(
    (m) => !m.content.trim().startsWith('//') && !m.content.toLowerCase().includes('reset')
  );
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
  const dangerous = searchAllFiles(files, /console\.log.*email|log.*\.email|logger.*email|log.*password|console\.log.*password/i).filter(
    (m) => !m.content.trim().startsWith('//')
  );
  return { pass: dangerous.length === 0, matches: dangerous };
}

function checkDataDeletionDocumented() {
  const docs = [readFile('PRIVACY.md'), readFile('privacy-policy.md'), readFile('README.md'), readFile('DOCUMENTATION.md')].join('\n');
  return /delete|deletion|erase|remove account|right to be forgotten/i.test(docs);
}

function resultFromBoolean(id, category, label, weight, pass) {
  return { id, category, label, weight, pass, issues: [] };
}

function runChecks(files) {
  const results = [];

  const secretsCheck = checkNoHardcodedSecrets(files);
  results.push({ id: 'no-hardcoded-secrets', category: 'Security', label: 'No hardcoded secrets detected', weight: 15, pass: secretsCheck.pass, issues: secretsCheck.matches });
  results.push(resultFromBoolean('env-gitignore', 'Security', '.env excluded from git', 10, checkEnvInGitignore()));
  results.push(resultFromBoolean('input-validation', 'Security', 'Input validation library used', 10, checkInputValidation(files)));
  results.push(resultFromBoolean('rate-limiting', 'Security', 'Rate limiting configured', 10, checkRateLimiting(files)));
  results.push(resultFromBoolean('security-headers', 'Security', 'Security headers configured', 5, checkSecurityHeaders(files)));

  const piiCheck = checkNoPiiInLogs(files);
  results.push({ id: 'no-pii-logs', category: 'Privacy', label: 'No PII in log statements', weight: 10, pass: piiCheck.pass, issues: piiCheck.matches });
  results.push(resultFromBoolean('privacy-policy', 'Privacy', 'Privacy policy exists', 5, fileExists('PRIVACY.md') || fileExists('privacy-policy.md')));
  results.push(resultFromBoolean('data-deletion', 'Privacy', 'Data deletion mechanism documented', 5, checkDataDeletionDocumented()));

  results.push(resultFromBoolean('password-hashing', 'Authentication', 'Secure password hashing used (bcrypt/argon2)', 15, checkPasswordHashing(files)));
  const plainPwdCheck = checkNoPlainPasswords(files);
  results.push({ id: 'no-plain-passwords', category: 'Authentication', label: 'No plain text passwords in code', weight: 15, pass: plainPwdCheck.pass, issues: plainPwdCheck.matches });
  const jwtCheck = checkJwtSecret(files);
  results.push({ id: 'jwt-secret', category: 'Authentication', label: 'JWT secret not hardcoded', weight: 10, pass: jwtCheck.pass, issues: jwtCheck.matches });

  const cardCheck = checkNoCardStorage(files);
  results.push({ id: 'no-card-storage', category: 'Payments', label: 'No card numbers in codebase', weight: 15, pass: cardCheck.pass, issues: cardCheck.matches });
  results.push(resultFromBoolean('webhook-verification', 'Payments', 'Webhook signature verification present', 10, checkWebhookVerification(files)));

  results.push(resultFromBoolean('error-monitoring', 'Reliability', 'Error monitoring configured', 10, checkErrorMonitoring(files)));
  results.push(resultFromBoolean('health-endpoint', 'Reliability', 'Health check endpoint exists', 5, checkHealthEndpoint(files)));
  results.push(resultFromBoolean('env-example', 'Reliability', '.env.example file exists', 5, checkEnvExample()));

  const outlineCheck = checkNoOutlineNone(files);
  results.push({ id: 'no-outline-none', category: 'Accessibility', label: 'No outline: none without replacement', weight: 5, pass: outlineCheck.pass, issues: outlineCheck.matches });
  results.push(resultFromBoolean('semantic-html', 'Accessibility', 'Semantic HTML elements used', 5, checkSemanticHtml()));

  results.push(resultFromBoolean('loading-states', 'UX States', 'Loading state patterns present', 5, checkLoadingStates()));
  results.push(resultFromBoolean('error-boundaries', 'UX States', 'Error boundaries implemented', 5, checkErrorBoundaries()));

  results.push(resultFromBoolean('api-versioning', 'API Design', 'API routes include version prefix', 5, checkApiVersioning(files)));
  results.push(resultFromBoolean('pagination', 'API Design', 'Pagination implemented on list endpoints', 5, checkPagination(files)));

  const emailPwdCheck = checkNoPasswordsInEmail(files);
  results.push({
    id: 'no-passwords-in-email',
    category: 'Email',
    label: 'No passwords sent in email body',
    weight: 5,
    pass: typeof emailPwdCheck === 'boolean' ? emailPwdCheck : emailPwdCheck.pass,
    issues: typeof emailPwdCheck === 'object' ? emailPwdCheck.matches : [],
  });
  results.push(resultFromBoolean('email-provider', 'Email', 'Email sending service configured', 5, checkEmailProvider(files)));

  results.push(resultFromBoolean('readme', 'Documentation', 'README.md exists', 5, checkReadme()));
  results.push(resultFromBoolean('env-example-docs', 'Documentation', '.env.example exists', 5, checkEnvExample()));
  results.push(resultFromBoolean('changelog', 'Documentation', 'CHANGELOG.md exists', 5, checkChangelog()));

  return results;
}

function buildScoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return `[${chalk.green('█'.repeat(filled))}${chalk.dim('░'.repeat(empty))}]`;
}

function resolveAuditProfile() {
  const metadata = readInstalledProfile(CWD);
  let selected = [];
  let excluded = [];

  if (metadata.valid && metadata.selectedStandards.length > 0) {
    selected = metadata.selectedStandards;
    excluded = metadata.excludedStandards;
  } else {
    const inferred = inferInstalledStandards(CWD);
    if (inferred.length > 0) {
      selected = inferred;
      excluded = getTemplateIds().filter((id) => !selected.includes(id));
    } else {
      selected = getTemplateIds();
      excluded = [];
    }
  }

  const coreMissing = CORE_STANDARD_IDS.filter((id) => !selected.includes(id));

  return {
    selected,
    excluded,
    coreMissing,
    metadataWarning: metadata.valid ? null : metadata.reason === 'invalid-json' ? '.prodready metadata is invalid; falling back to inferred profile.' : null,
  };
}

function asRuleFindings(results, rulesById, activeStandards) {
  return results
    .map((result) => {
      const rule = rulesById.get(result.id);
      const inScope = activeStandards.includes(rule.standard);
      const status = inScope ? (result.pass ? 'pass' : 'fail') : 'not_applicable';
      return {
        ruleId: rule.id,
        standard: rule.standard,
        severity: rule.severity,
        label: result.label,
        status,
        weight: result.weight,
        remediation: rule.remediation,
        evidence: (result.issues || []).map((issue) => ({
          file: issue.file,
          line: issue.line || null,
          snippet: issue.content || null,
        })),
      };
    })
    .sort((a, b) => {
      const severityDiff = severityRank(b.severity) - severityRank(a.severity);
      if (severityDiff !== 0) return severityDiff;
      return a.ruleId.localeCompare(b.ruleId);
    });
}

function shouldFailAudit({ findings, score, failOn, minScore, requireCore, coreMissing }) {
  let failed = false;

  if (failOn && failOn !== 'none') {
    const threshold = severityRank(failOn);
    if (findings.some((finding) => finding.status === 'fail' && severityRank(finding.severity) >= threshold)) {
      failed = true;
    }
  }

  if (typeof minScore === 'number' && score < minScore) {
    failed = true;
  }

  if (requireCore && coreMissing.length > 0) {
    failed = true;
  }

  return failed;
}

function selectAgentPromptFindings(findings, maxChecks = 3) {
  return findings.filter((finding) => finding.status === 'fail').slice(0, maxChecks);
}

function formatEvidenceRefs(evidence, maxEvidence = 3) {
  const refs = [];
  const seen = new Set();

  for (const item of evidence || []) {
    const ref = item.line ? `${item.file}:${item.line}` : item.file;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    if (refs.length >= maxEvidence) break;
  }

  return refs;
}

function escapeFenceText(value) {
  return String(value || '').replace(/```/g, '`` `');
}

function buildAgentPromptBlock({ selectedFindings }) {
  const lines = [
    '```txt',
    'Fix the following ProdReady audit failures with minimal, safe code changes.',
    'Keep behavior unchanged except where needed to satisfy the checks.',
    '',
    'Targets:',
  ];

  selectedFindings.forEach((finding, index) => {
    lines.push(`${index + 1}. [${escapeFenceText(finding.ruleId)}] ${escapeFenceText(finding.label)}`);
    lines.push(`   Remediation: ${escapeFenceText(finding.remediation || 'Follow the relevant project standard.')}`);
    const evidenceRefs = formatEvidenceRefs(finding.evidence, 3);
    if (evidenceRefs.length > 0) {
      lines.push(`   Evidence: ${evidenceRefs.map((ref) => escapeFenceText(ref)).join(', ')}`);
    } else {
      lines.push('   Evidence: (none provided)');
    }
  });

  lines.push('');
  lines.push('After changes:');
  lines.push('1. Run tests.');
  lines.push('2. Re-run `npx @chrisadolphus/prodready audit`.');
  lines.push('3. Summarize what changed and why.');
  lines.push('```');

  return lines.join('\n');
}

export async function audit(options = {}) {
  const format = options.format === 'json' ? 'json' : 'text';
  const cliFailOnProvided = options.failOn !== undefined;
  const cliMinScoreProvided = options.minScore !== undefined || options.minScoreRaw !== undefined;
  const cliRequireCoreProvided = options.requireCore !== undefined;
  const showAdvice = format === 'text' && !options.noAdvice;
  const showAgentPrompt = format === 'text' && Boolean(options.agentPrompt);

  const config = readProdreadyConfig(CWD);
  if (config.error === 'invalid-json') {
    const message = 'Invalid prodready.json: expected valid JSON.';
    if (format === 'json') {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(chalk.red(`  ${message}`));
    }
    process.exitCode = 1;
    return;
  }

  const configPolicyCandidate = config.data?.auditPolicy;
  const configPolicy = validateAuditPolicy(configPolicyCandidate);
  if (config.exists && !configPolicy.valid) {
    const message = `Invalid prodready.json auditPolicy: ${configPolicy.errors.join('; ')}`;
    if (format === 'json') {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(chalk.red(`  ${message}`));
    }
    process.exitCode = 1;
    return;
  }

  const cliFailOnValue = cliFailOnProvided ? String(options.failOn).toLowerCase() : null;
  const failOn = cliFailOnProvided
    ? cliFailOnValue === 'none'
      ? 'none'
      : normalizeSeverity(options.failOn)
    : configPolicy.value.failOn;
  if (cliFailOnProvided && options.failOn && failOn == null) {
    const message = `Invalid --fail-on value. Use one of: ${getValidSeverities().join(', ')}, none`;
    if (format === 'json') {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(chalk.red(`  ${message}`));
    }
    process.exitCode = 1;
    return;
  }

  const minScore = cliMinScoreProvided ? options.minScore : configPolicy.value.minScore;
  if (cliMinScoreProvided && options.minScore == null && options.minScoreRaw != null) {
    if (format === 'json') {
      console.log(JSON.stringify({ error: 'min-score must be a number between 0 and 100.' }, null, 2));
    } else {
      console.error(chalk.red('  --min-score must be a number between 0 and 100.'));
    }
    process.exitCode = 1;
    return;
  }

  if (minScore != null && (minScore < 0 || minScore > 100)) {
    if (format === 'json') {
      console.log(JSON.stringify({ error: 'min-score must be between 0 and 100.' }, null, 2));
    } else {
      console.error(chalk.red('  --min-score must be between 0 and 100.'));
    }
    process.exitCode = 1;
    return;
  }
  const requireCore = cliRequireCoreProvided ? Boolean(options.requireCore) : configPolicy.value.requireCore;

  const rules = loadRules();
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));

  if (format === 'text') {
    console.log(chalk.bold('  Scanning your repository...\n'));
  }

  const files = getAllFiles(CWD);

  if (files.length === 0) {
    if (format === 'json') {
      console.log(JSON.stringify({ error: 'No source files found. Run from your project root.' }, null, 2));
    } else {
      console.log(chalk.yellow('  No source files found. Make sure you are running this from your project root.\n'));
    }
    return;
  }

  if (format === 'text') {
    console.log(chalk.dim(`  Found ${files.length} source files to scan.\n`));
  }

  const profile = resolveAuditProfile();
  const rawResults = runChecks(files);
  const activeResults = rawResults.filter((result) => profile.selected.includes(rulesById.get(result.id).standard));

  const totalWeight = activeResults.reduce((sum, result) => sum + result.weight, 0) || 1;
  const passedWeight = activeResults.filter((result) => result.pass).reduce((sum, result) => sum + result.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  const findings = asRuleFindings(rawResults, rulesById, profile.selected);
  const findingsByRuleId = new Map(findings.map((finding) => [finding.ruleId, finding]));

  if (format === 'json') {
    const output = {
      profile: {
        selected: profile.selected,
        excluded: profile.excluded,
        coreMissing: profile.coreMissing,
        metadataWarning: profile.metadataWarning,
      },
      score,
      thresholds: {
        failOn: failOn || null,
        minScore,
        requireCore,
      },
      findings,
    };

    console.log(JSON.stringify(output, null, 2));

    const failed = shouldFailAudit({ findings, score, failOn, minScore, requireCore, coreMissing: profile.coreMissing });
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (profile.metadataWarning) {
    console.log(chalk.yellow(`  ${profile.metadataWarning}`));
    console.log('');
  }

  console.log(chalk.bold(`  Active profile: ${profile.selected.join(', ')}`));
  if (profile.excluded.length > 0) {
    console.log(chalk.dim(`  Excluded standards: ${profile.excluded.join(', ')}`));
  }
  if (profile.coreMissing.length > 0) {
    console.log(chalk.yellow(`  Core standards missing: ${profile.coreMissing.join(', ')}`));
  }
  console.log('');

  const categoryMap = new Map();
  for (const result of activeResults) {
    if (!categoryMap.has(result.category)) categoryMap.set(result.category, []);
    categoryMap.get(result.category).push(result);
  }

  for (const [category, checks] of categoryMap.entries()) {
    const allPass = checks.every((check) => check.pass);
    const categoryIcon = allPass ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${categoryIcon} ${chalk.bold(category)}`);

    for (const check of checks) {
      const icon = check.pass ? chalk.green('  ✓') : chalk.red('  ✗');
      const label = check.pass ? chalk.dim(check.label) : chalk.white(check.label);
      const weight = check.pass ? '' : chalk.dim(` [-${check.weight}pts]`);
      console.log(`${icon} ${label}${weight}`);

      if (!check.pass && showAdvice) {
        const remediation = findingsByRuleId.get(check.id)?.remediation;
        if (remediation) {
          console.log(chalk.dim(`       Fix: ${remediation}`));
        }
      }

      if (!check.pass && check.issues && check.issues.length > 0) {
        for (const issue of check.issues.slice(0, 3)) {
          console.log(chalk.dim(`       → ${issue.file}${issue.line ? `:${issue.line}` : ''}`));
        }
        if (check.issues.length > 3) {
          console.log(chalk.dim(`       → ...and ${check.issues.length - 3} more`));
        }
      }
    }
    console.log('');
  }

  const scoreColor = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  console.log('  ─────────────────────────────────────────');
  console.log('');
  console.log(`  Overall Score: ${scoreColor.bold(score + ' / 100')}  ${buildScoreBar(score)}`);
  console.log('');

  const failedCount = activeResults.filter((result) => !result.pass).length;
  if (score === 100) {
    console.log(chalk.green.bold('  ✓ Your active standards profile passed all checks.\n'));
  } else if (score >= 80) {
    console.log(chalk.yellow(`  ${failedCount} issue${failedCount === 1 ? '' : 's'} to fix for this standards profile.\n`));
  } else if (score >= 50) {
    console.log(chalk.yellow(`  ${failedCount} issues found. Review standards coverage and remediation items.\n`));
  } else {
    console.log(chalk.red('  Critical issues found in your active standards profile.\n'));
  }

  const failed = shouldFailAudit({ findings, score, failOn, minScore, requireCore, coreMissing: profile.coreMissing });
  if (failed) {
    console.log(chalk.red('  Audit failed due to configured enforcement thresholds.\n'));
    process.exitCode = 1;
  }

  const exitCode = failed ? 1 : 0;
  const statusText = failed ? chalk.red('FAIL') : chalk.green('PASS');
  console.log(`  Result: ${statusText} ${chalk.dim(`(exit ${exitCode})`)}`);
  console.log('');

  if (showAgentPrompt) {
    const selectedFindings = selectAgentPromptFindings(findings, 3);
    if (selectedFindings.length === 0) {
      console.log(chalk.dim('  No failed checks to generate an agent prompt.'));
      console.log('');
    } else {
      console.log(chalk.bold('  Copy/Paste for Coding Agent'));
      console.log('');
      console.log(buildAgentPromptBlock({ selectedFindings }));
      console.log('');
    }
  }
}
