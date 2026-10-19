# MEM: Engineering process and conventions
Date: 2026-10-18
Status: Approved
Tags: [process, git, testing, ci]

## Summary
How work is done in this repository, adapted from the engineering spec. Rationale: [ADR-0006](../../docs/adr/ADR-0006-git-workflow-github-flow.md), [ADR-0008](../../docs/adr/ADR-0008-adapting-engineering-spec.md).

## Details
### Context & Evolution (脈絡與演進)
The spec targets a full-stack service; this is a docs-only plugin with small tooling. Sections without a counterpart are recorded as N/A in ADR-0008.

### Specification
- **Locations:** memories `.agents/memories/MEM-NNNN-*.md`, errors `.agents/errors/ERR-YYYYMMDD-*.md`, workflows `.agents/skills/SKILL-*.md` (spec §10 wins over §7.2). Backlog `todo.md`; changelog `CHANGELOG.md`; reports `docs/reports/`.
- **Supersession is bidirectional:** when a MEM/ADR replaces another, update **both** files (old → `Superseded by`, new → `Supersedes`); never edit one side only.
- **Git:** GitHub Flow; branches `feature|fix|refactor|test|chore/*`; merge with `--no-ff` after checks; delete the branch; releases are tags `vX.Y.Z`. Conventional Commits (`feat`, `fix`, `test`, `refactor`, `docs`, `chore`), one complete testable unit per commit. Skill-only branches are validated at the PR (reference cycle).
- **Tests:** `npm test`; gate `npm run test:coverage` (lines ≥ 80 %, branches ≥ 70 % on `scripts/lib/`); names `should_<expected>_when_<condition>`; AAA; write the test first.
- **Checks before merge:** `npm run check`, `npm run sync` (no diff), gitleaks, and for skill changes `python3 tools/scripts/verify-cli-commands.py all`.
- **Release:** bump both `plugin.json` versions, update `CHANGELOG.md`, run checks, tag.
- **The initial git history was constructed from the finished tree** (atomic commits on feature branches); it is logical, not chronological.

## When to Use
Before starting any change, opening a PR, or cutting a release.
