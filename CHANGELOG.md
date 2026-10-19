# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet. Open work is tracked in [`todo.md`](todo.md).

## [2.0.0] - 2026-10-18

First release as a multi-cloud plugin. The structure was adapted from the single-vendor baseline [zeabur/agent-skills](https://github.com/zeabur/agent-skills) (1.22.0 / 1.21.3, see [MEM-0001](.agents/memories/MEM-0001-upstream-baseline.md)); all of its skills were replaced.

### Added
- **20 skills** driving `aws` (v2), `gcloud` and `az`: `core` (router + rules), `auth`, `catalog`, `server-rent`, `server-manage`, `server-exec`, `deploy` (Cloud Run, **ECS Express Mode**, Azure Container Apps), `inventory`, `logs`, `metrics`, `config`, `scale`, `restart-rollback`, `database`, `storage`, `network`, `domain-dns`, `cost`, `delete`, `troubleshoot`.
- **Safety model** shared by all skills: action classes (READ / CHANGE / SPEND / EXPOSE / DESTROY / IAM), explicit target on every command, priced confirmation, typed-name confirmation for data-bearing deletes, `managed_by=cloudops_agent` tagging, secret handling, no invented prices ([ADR-0003](docs/adr/ADR-0003-safety-model-action-classes.md)).
- Tooling with tests: skill/manifest validator, Codex mirror generator (31 tests; 100 % line / 98 % branch coverage; 11/11 mutations caught), CLI command verifier (`tools/scripts/verify-cli-commands.py`).
- CI: validate + tests with coverage gate, mirror drift check, gitleaks secret scan with a custom policy (`.gitleaks.toml`).
- Design documentation: architecture overview with a generated skill dependency graph, 5 diagrams, 8 ADRs, 5 memory records, 9 error records, 3 reusable workflows, backlog and reports.
- English and Traditional Chinese README.

### Changed
- AWS deploys target **ECS Express Mode**; App Runner stopped accepting new customers on 2026-04-30 ([ADR-0004](docs/adr/ADR-0004-aws-default-deploy-target-ecs-express.md)).
- Both plugin manifests must now carry the same version (the baseline had drifted); enforced by the validator.

### Security
- VM creation restricts SSH to the user's IP (Azure: `--nsg-rule NONE`, whose default is world-open); databases default to private, encrypted, backed up, deletion-protected; buckets default to private.
- Gitleaks policy tightened from the spec's raw patterns to avoid false positives (`disk-size`, `task-definition`) while still catching planted fakes ([ADR-0008](docs/adr/ADR-0008-adapting-engineering-spec.md)).

### Known issues
- **`gcloud` commands are unverified** (the CLI could not be installed in the build environment); review them before relying on them.
- No resources have been created in a real cloud account; AWS v2-only commands (`logs tail`, `sso login`) are checked against documentation, not executed.
- ECS Express custom-domain attachment has no verified CLI path; `cpu`/`memory` units follow the API model, which conflicts with AWS's example ([ERR](.agents/errors/ERR-20261018-ecs-express-cpu-memory-unit-conflict.md)).
- Azure budgets with notifications are not covered.

[Unreleased]: https://github.com/mangreen/cloudops-skills/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/mangreen/cloudops-skills/releases/tag/v2.0.0
