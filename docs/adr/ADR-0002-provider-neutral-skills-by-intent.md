# ADR-0002: Provider-neutral skills organised by intent

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0002](../../.agents/memories/MEM-0002-cloudops-architecture.md)

## Context

Users say "deploy this", "show logs", "scale up" — not "run `gcloud run deploy`". The repository must map intent to per-cloud commands across three clouds.

## Decision

One skill per **intent** (deploy, logs, metrics, config, scale, rollback, database, storage, network, DNS, cost, delete, troubleshoot, server rent/manage/exec, catalog, inventory, auth) plus `cloudops-core` as router and rulebook. Each skill has AWS / GCP / Azure sections; large per-cloud detail is split into `references/` (progressive disclosure).

## [Trade-off Analysis]

**Pros**
- The safety workflow (ask → preflight → confirm → run → verify → report) exists once per intent, not three times.
- "Deploy" triggers one skill regardless of cloud; cross-cloud comparison (prices, concept map) is natural.
- 20 skill descriptions instead of ~57 keeps the always-loaded context small.

**Cons**
- Each skill is longer and mixes three vocabularies.
- Skills reference each other, forming a dense graph (15 of 19 non-core skills in one cycle — see [architecture overview](../architecture/overview.md#4-skill-dependency-graph-impact-graph)).
- Cross-cloud flag collisions need loud warnings (`--set-env-vars`).

**Alternatives rejected**
- *Per-cloud skill sets* (`aws-*`, `gcp-*`, `azure-*`): duplicates the safety workflow ×3 and drifts apart.
- *One mega-skill*: loads everything every time; no useful triggers.

**Reason**
Intent is how users speak, and the safety rules are the product; both belong in one place per intent.

## Consequences

- Cross-references are validated by CI; the validator is the guard against name typos.
- Skill commits that reference not-yet-added skills cannot pass per commit; validation happens per PR ([ADR-0006](ADR-0006-git-workflow-github-flow.md)).
