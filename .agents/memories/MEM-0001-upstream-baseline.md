# MEM: Upstream baseline (zeabur/agent-skills)
Date: 2026-10-18
Status: Superseded by MEM-0002-cloudops-architecture.md
Tags: [baseline, upstream, history]

## Summary
DEPRECATED: Superseded by [MEM-0002-cloudops-architecture.md](MEM-0002-cloudops-architecture.md). This record preserves what the project started from, so the changes in MEM-0002 can be understood.

## Details
### Context & Evolution (脈絡與演進)
This repository began as a rewrite of [zeabur/agent-skills](https://github.com/zeabur/agent-skills), a Claude Code and Codex plugin of **single-vendor** CLI skills (`npx zeabur@latest …`). Observed state when read (latest commit `5c8c19a`, 2026-09-06):

- 32 skills, all prefixed `zeabur-` (auth, deploy, server-rent, server-list, server-ssh, service-exec, variables, restart, database, object-storage, domain-*, template-*, port-mismatch, startup-order, migration, …).
- Plugin versions **1.22.0** (Claude) and **1.21.3** (Codex) — the two manifests had drifted apart.
- A generated Codex mirror `plugins/zeabur/` produced by `scripts/sync-codex-plugin.mjs`, with a CI check that fails when it is stale.
- Conventions in `AGENTS.md` / `CLAUDE.md`: `SKILL.md` frontmatter with trigger phrases, "last line of defense" confirmation before spending money, bounded polling, no blind retry after a timeout.
- README says MIT but the repository contains **no LICENSE file**.

### Specification
Kept in MEM-0002: plugin layout, mirror generator + CI drift check, frontmatter/trigger style, confirmation-before-spend, bounded waits, no blind retries.
Replaced in MEM-0002: the vendor CLI, all `zeabur-*` skills, the single-cloud assumptions, and the lack of a version-consistency check.

## When to Use
Only to understand project history or to port a change from upstream. **AI must IGNORE this spec for current behaviour** — its Status is Superseded.
