# @chrisadolphus/prodready

> Production-grade standards for any repo. Free. Open source. MIT.

Drop 10 comprehensive standard files into any repository in seconds. Audit your codebase against production best practices. Guide your AI agents to write better, safer code.

---

## Quick Start

```bash
# Audit your repo — get a score out of 100
npx @chrisadolphus/prodready audit

# Install all 10 standard templates
npx @chrisadolphus/prodready init
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npx @chrisadolphus/prodready audit` | Scan your repo for missing standards and get a score out of 100 |
| `npx @chrisadolphus/prodready init` | Drop all 10 production-grade standard templates into your repo |
| `npx @chrisadolphus/prodready list` | Show all available standards and which are installed |
| `npx @chrisadolphus/prodready check` | Check if your installed templates are up to date |

---

## What's Included

All 10 standards templates covering the most critical gaps in production software:

| File | Covers |
|------|--------|
| `SECURITY.md` | Secrets management, input validation, rate limiting, security headers, AI/LLM security |
| `PRIVACY.md` | Data minimisation, user deletion, PII in logs, cookie consent, GDPR |
| `AUTHENTICATION.md` | Password hashing, token expiry, email verification, passkeys, RBAC |
| `PAYMENTS.md` | Payment data security, webhook verification, dunning, receipts, cancellation |
| `RELIABILITY.md` | Error monitoring, database backups, uptime monitoring, deployment, logging |
| `ACCESSIBILITY.md` | WCAG 2.2 AA — images, keyboard nav, colour contrast, semantic HTML, forms |
| `UX-STATES.md` | Empty states, loading states, error states, confirmation, success feedback |
| `API-DESIGN.md` | Versioning, pagination, consistent responses, idempotency, data exposure |
| `EMAIL.md` | SPF/DKIM/DMARC, unsubscribe links, sending infrastructure, link expiry |
| `DOCUMENTATION.md` | README, code comments, changelog, environment variables, architecture records |

---

## Works With Your AI Agent

Every template is written as "MUST FOLLOW" rules that your AI coding agent reads directly from your repo.

**Cursor / Claude Code / Copilot prompt:**
```
Follow all rules in the standards/ directory of this project.
```

That's it. Your AI agent will automatically follow your security, accessibility, and reliability standards while writing code.

---

## Why This Exists

AI coding agents ship features fast — but they skip input validation, miss auth checks, ignore accessibility, and forget rate limiting. Without explicit rules, they don't know what "production-ready" means for your project.

ProdReady gives your AI agent the rules it needs — and gives you a score to track compliance.

---

## Requirements

- Node.js 18 or higher
- No other dependencies

---

## License

MIT — free forever, open source, no paid tier.
