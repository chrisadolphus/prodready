# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added
- New `audit --agent-prompt` output mode that prints a copy/paste-ready coding-agent prompt (top 3 failed checks, remediation, and path:line evidence).
- Stronger `audit` config validation for `prodready.json` policy fields and types.

### Changed
- `init` now validates `prodready.json` before any file writes (fail-fast atomic behavior).
- `init` now updates CI more safely by avoiding duplicate audit insertion across multiline run blocks and later jobs.
- Repository CI smoke audit now uses `npx @chrisadolphus/prodready audit` to exercise policy-driven behavior.

## [1.0.2] - 2026-03-08

### Added
- Enforceable `audit` checks with CI-gate support.
- Selective `init` flow improvements for targeted setup.

### Changed
- Polished `audit` output for clearer final results.

### Fixed
- CI test stability improvements, including serial test execution.
- Made the core-requirement `audit` test self-contained in CI.

## [1.0.1] - 2026-03-08

### Added
- `CHANGELOG.md` and `MIT` license files.
- Open-source community and contribution documentation/templates.
- npm, CI, and license badges in project documentation.

### Changed
- Renamed score output to "overall score".

## [1.0.0] - 2026-03-08

### Added
- Initial public release of `@chrisadolphus/prodready`.
- CLI commands: `audit`, `init`, `list`, `check`.
- 10 production standards templates under `templates/`.
- CI workflow for smoke checks and package dry-run.
- Open-source contribution scaffolding:
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - Issue templates and PR template.
