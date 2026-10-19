# ADR-0006: GitHub Flow, Conventional Commits, release tags

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0004](../../.agents/memories/MEM-0004-engineering-process.md) · Diagram: [git workflow](../diagrams/git-workflow.md)

## Context

The engineering spec offers GitHub Flow (branch → PR → `main` → release tag) or Phase Flow (for self-study projects). This repository is a distributable plugin with versions users install and update.

## Decision

Use **GitHub Flow**: `main` is always stable; short-lived `feature/*`, `fix/*`, `refactor/*`, `test/*`, `chore/*` branches merge via PR (locally: `git merge --no-ff` after the checks pass); branches are deleted after merge; releases are tags `vX.Y.Z`. No `develop` or `release/*` branches. Commits follow **Conventional Commits** (`feat`, `fix`, `test`, `refactor`, `docs`, `chore`), one complete testable unit each.

## [Trade-off Analysis]

**Pros**
- Matches how the plugin is consumed (install from `main` or a tag).
- `--no-ff` merges keep each atomic commit visible and the branch boundary explicit.
- Tags give users a stable version to pin.

**Cons**
- Phase Flow would document learning milestones better — not the goal here.
- `--no-ff` produces merge commits (a squash merge would give a linear history but lose the atomic commits).

**The per-commit gate has one exception.** Fifteen skills reference each other, so skills added in several commits cannot each pass the cross-reference check on their own. The check is therefore a **PR gate**: every commit on such a branch passes everything except "unknown skill" for skills added later in the same branch; the merge commit passes everything. See the [architecture overview](../architecture/overview.md#4-skill-dependency-graph-impact-graph).

**Reason**
Simple, fits distribution by tag, keeps `main` releasable.

## Consequences

- CI runs on pushes to `main`, tags and PRs ([`ci.yml`](../../.github/workflows/ci.yml)).
- The initial history was **constructed** as atomic commits from the finished tree; it is a logical history, not a record of the order in which files were first written.
