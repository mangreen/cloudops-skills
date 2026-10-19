# MEM: CloudOps architecture
Date: 2026-10-18
Status: Approved · Supersedes MEM-0001-upstream-baseline.md
Tags: [architecture, skills, plugin]

## Summary
Updates/Supersedes [MEM-0001-upstream-baseline.md](MEM-0001-upstream-baseline.md): a multi-cloud plugin of 20 intent-based skills that drive `aws` (v2), `gcloud` and `az`. Rationale: [ADR-0001](../../docs/adr/ADR-0001-use-official-clis-as-execution-layer.md), [ADR-0002](../../docs/adr/ADR-0002-provider-neutral-skills-by-intent.md); diagrams: [overview](../../docs/architecture/overview.md).

## Details
### Context & Evolution (脈絡與演進)
MEM-0001's single-vendor design did not fit the goal "one sentence → deploy / provision / operate on AWS, GCP, Azure". The layout and confirmation discipline were kept; the skill set, CLIs and safety model were rewritten.

### Specification
- `skills/cloudops-core` is the router and rulebook; 19 intent skills sit behind it (auth, catalog, server-rent/manage/exec, deploy, inventory, logs, metrics, config, scale, restart-rollback, database, storage, network, domain-dns, cost, delete, troubleshoot).
- Skills have AWS / GCP / Azure sections; large per-cloud detail lives in `references/` (only `cloudops-deploy` and `cloudops-catalog` use it today).
- Skills reference each other **by name only**; the validator fails CI on unknown names and missing reference files. Fifteen skills form one reference cycle — a rename touches many files.
- `plugins/cloudops/` is a generated mirror: never edit; `npm run sync`.
- Both `plugin.json` versions must be equal (enforced).
- Skill frontmatter: `name` = directory, `description` ≤ 1024 chars with English + 中文 trigger phrases.

## When to Use
When adding, renaming or removing a skill, or when deciding where new behaviour belongs.
