# Roadmap

Last updated: March 10, 2026

## Thesis

ProdReady is becoming a deterministic, vendor-neutral policy layer for AI-assisted code workflows.
We are not building another AI reviewer. We are building reliable policy enforcement that survives tool churn.

## Operating Cadence

- Daily: small canary improvements.
- Weekly: one stable release with migration notes.
- Scope discipline: solo-founder, 2 hours/day, 5 days/week.

Status labels:
- `Committed`: actively scheduled for upcoming stable releases.
- `Exploring`: being validated; no delivery promise yet.

## Decision Rules

An item moves from `Exploring` -> `Committed` only if:
1. It reduces false positives in blocking checks or improves onboarding time.
2. It can ship behind existing backward-compatible behavior.
3. It does not add recurring maintenance burden that exceeds solo capacity.

An item is dropped if:
1. It fails to improve a named metric within 2 stable releases.
2. It increases adapter/config drift risk without clear user pull.

## Success Metrics (Current Targets)

- Blocking false-positive rate: <15%
- Advisory -> blocking conversion: >40%
- Median time-to-fix blocked findings: <20 minutes
- Active weekly repos: 8+ design partners

## Now (0-30 days)

- [Committed] Deterministic finding fingerprints
  Exit criteria: same repo + config yields stable finding IDs across reruns.
- [Committed] Baseline flow (`--baseline create|use`) + `--new-only`
  Exit criteria: existing findings don’t block when unchanged; new high/critical findings do.
- [Committed] Suppressions with reason + expiry
  Exit criteria: expired suppressions are visible and enforced in blocking mode.
- [Committed] Advisory vs blocking mode
  Exit criteria: clear exit-code behavior and docs for rollout path.
- [Committed] Default scope exclusions for tests/fixtures/specs
  Exit criteria: measurable reduction in noisy findings on sample repos.

## Next (30-60 days)

- [Committed] SARIF output
  Exit criteria: compatible ingestion in GitHub code scanning.
- [Committed] `integrate github` setup command
  Exit criteria: one-command workflow bootstrap with drift detection.
- [Committed] `policy explain`
  Exit criteria: users can see why a repo passed/failed without reading source.
- [Exploring] Presets (`startup-api`, `saas-web`, `agent-heavy`)
  Exit criteria: onboarding time reduction on partner repos.
- [Exploring] Additional high-confidence rule tuning
  Exit criteria: no regression in blocking precision target.

## Later (60+ days)

- [Exploring] Cursor adapter
  Gate: only after GitHub path is stable and maintenance budget is proven.
- [Exploring] CodeRabbit adapter
  Gate: only after adapter contract tests and clear demand signal.
- [Exploring] Hosted organization reporting
  Gate: only after OSS adoption metrics clear targets.
- [Exploring] SOC2-lite control mapping
  Gate: only after policy core stabilizes.
- [Exploring] Non-JS/TS language expansion
  Gate: only after current rule set achieves sustained precision.

## Risks and Mitigations

- Adapter drift risk:
  Mitigation: GitHub+SARIF first; defer additional adapters until metrics justify.
- Solo bandwidth risk:
  Mitigation: weekly stable only, strict de-scope, no hosted build in this phase.
- Perception risk (“another scanner”):
  Mitigation: emphasize deterministic policy portability, not AI review intelligence.

## Out of Scope (This Phase)

- Full hosted platform
- Full compliance framework mapping (SOC2/ISO/NIST)
- Competing on LLM review quality
- Broad multi-language expansion
