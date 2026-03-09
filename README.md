# @chrisadolphus/prodready

> Production-grade standards for any repo. Free. Open source. MIT.

[![npm version](https://img.shields.io/npm/v/@chrisadolphus/prodready.svg)](https://www.npmjs.com/package/@chrisadolphus/prodready)
[![CI](https://github.com/chrisadolphus/prodready/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisadolphus/prodready/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Drop production standards into your repository, wire them into `AGENTS.md`, and enforce them with auditable checks.

---

## Quick Start

```bash
# Install all 10 templates (backward-compatible default)
npx @chrisadolphus/prodready init

# Auto-select standards based on project signals
npx @chrisadolphus/prodready init --auto

# Audit the active profile
npx @chrisadolphus/prodready audit
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npx @chrisadolphus/prodready init` | Install all templates and manage `AGENTS.md` |
| `npx @chrisadolphus/prodready init --only security,privacy,reliability` | Install selected standards only |
| `npx @chrisadolphus/prodready init --exclude payments,authentication` | Install all except excluded standards |
| `npx @chrisadolphus/prodready init --auto` | Detect and install likely-relevant standards |
| `npx @chrisadolphus/prodready audit` | Run standards checks and show score |
| `npx @chrisadolphus/prodready audit --no-advice` | Hide fix advice from text output |
| `npx @chrisadolphus/prodready audit --format json` | Machine-readable findings |
| `npx @chrisadolphus/prodready audit --fail-on high --min-score 85 --require-core` | CI enforcement mode |
| `npx @chrisadolphus/prodready list` | Show standards and profile status |
| `npx @chrisadolphus/prodready check` | Check installed standards for drift |

---

## Standards Included

- `SECURITY.md`
- `PRIVACY.md`
- `AUTHENTICATION.md`
- `PAYMENTS.md`
- `RELIABILITY.md`
- `ACCESSIBILITY.md`
- `UX-STATES.md`
- `API-DESIGN.md`
- `EMAIL.md`
- `DOCUMENTATION.md`

Core standards for CI gating are: `SECURITY`, `PRIVACY`, `RELIABILITY`, `DOCUMENTATION`.

---

## CI Enforcement

Use pinned versions in CI for reproducibility:

```yaml
- name: Audit standards
  run: npx @chrisadolphus/prodready@1.0.1 audit --fail-on high --min-score 85 --require-core
```

Recommended behavior:
- `--fail-on high`: fail on high/critical violations.
- `--min-score 85`: keep profile quality bar explicit.
- `--require-core`: block score gaming by excluding core standards.

Text-mode audits now include a short `Fix:` line for each failed in-scope check. Use `--no-advice` if you want the previous compact output.

---

## Works With AI Agents

`init` now creates or refreshes a root `AGENTS.md` with a ProdReady-managed section that points agents at the repo's `standards/` directory and active standards profile.

Managed section markers:

```html
<!-- PRODREADY:START -->
<!-- PRODREADY:END -->
```

Only the content inside that block is owned by ProdReady. Any other `AGENTS.md` content is preserved.

If you need to reference the standards manually in an agent prompt, use:

```txt
Follow all rules in the standards/ directory of this project.
```

---

## Requirements

- Node.js 18 or higher

---

## License

MIT — free forever, open source, no paid tier.
