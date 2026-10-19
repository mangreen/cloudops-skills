# ADR-0008: Adapting the engineering spec to a docs-only plugin

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0004](../../.agents/memories/MEM-0004-engineering-process.md)

## Context

The governing spec ("AI Loop/Graph Engineering — System Prompt v3.0") targets a production full-stack service: hexagonal architecture, REST endpoints, DTO validation, idempotency keys, structured request logging. This repository is markdown skills plus a small amount of Node and Python tooling. Applying every rule literally would produce ceremony with no value; ignoring it would break the team's process.

## Decision

Apply each spec section where it has a real counterpart and record the rest as not applicable.

| Spec section | Status here | How |
|--------------|-------------|-----|
| §1–2 Principles, trade-off blocks | Applied | `[Trade-off Analysis]` in every ADR; KISS kept |
| Clean / Hexagonal, DDD, SOLID | Adapted | Tooling only: pure logic in `scripts/lib/`, I/O in thin CLI wrappers |
| §3 Test pyramid, AAA, naming, mutation mindset | Applied to tooling | `tests/`, `should_…_when_…` names, boundary tests, mutation check run |
| §3.3 Coverage gate 80 % | Applied | lines ≥ 80 %, branches ≥ 70 % on `scripts/lib/` (CI) |
| §4.1 DTO validation, idempotency | N/A | No API or state-changing endpoints |
| §4.2 Structured logging, trace-id | N/A | No runtime service |
| §4.3 Secrets | Applied | `.gitleaks.toml` in CI; no `.env.example` needed (no env vars); spec regexes tightened (see below) |
| §5 Graph / impact analysis | Applied | Generated dependency graph + change-impact graph |
| §6 TDD loop | Applied | Red → Green for the scripts |
| §7 Memory, context snapshots | Applied | `.agents/memories`, `.agents/errors`, `.agents/skills`, `todo.md` |
| §8 Git | Applied | [ADR-0006](ADR-0006-git-workflow-github-flow.md) |
| §9 Reports | Applied | Daily and weekly (2026-W42) reports; monthly at month end |
| §10 Structure | Adapted | `skills/` is the "source"; no `src/`, no `docs/api/` (no OpenAPI) |
| §11 Comments | Applied | `NOTE` / `TODO` / `FIXME`, why-not-what |

**Spec inconsistency resolved.** §7.2 puts memory files in `./memory`, `./error`, `./skill`; §10 puts them in `.agents/memories`, `.agents/errors`, `.agents/skills`. §10 is the "unified directory structure", so it wins.

**Deliberate deviation.** The spec's pattern `sk-[a-zA-Z0-9]` matches `disk-size`, `task-definition`, `task-role` (5 false positives in this repository; the `secret\s*[:=]` pattern added a sixth on a jq output label). The gitleaks rule anchors a word boundary and requires ≥ 20 characters; password / secret / api-key rules require ≥ 4 non-space characters inside the quotes, and the spec's placeholders (`your-…-here`, `changeme`) are allow-listed. Verified with planted fakes (5 detected) and placeholders (0 flagged).

## [Trade-off Analysis]

**Pros**
- The process stays recognisable to anyone who knows the spec; nothing is silently skipped — every "N/A" is written down with its reason.
- Quality gates (tests, coverage, secrets) apply where code actually exists.

**Cons**
- A few ceremonies (ADR + MEM per decision) overlap; MEM is kept to the operational rule, ADR to the rationale.
- `tests/` and `tools/` are small and could look over-engineered next to the docs.

**Reason**
Pragmatic over dogmatic (spec §1): follow the intent — safe, tested, reviewable, documented — not the letter.

## Consequences

- Risk (unverified): `.agents/skills/` is also a location some agents scan for repo skills. Our files there are flat `SKILL-*.md`, not `<name>/SKILL.md` directories, so they should not be auto-loaded — confirm in Codex before relying on it.
