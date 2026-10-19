# ADR-0001: Drive the clouds through their official CLIs

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0002](../../.agents/memories/MEM-0002-cloudops-architecture.md)

## Context

The goal is "one sentence → deployed / provisioned / fixed" on AWS, GCP and Azure. The agent needs an execution layer. Candidates: official CLIs (`aws`, `gcloud`, `az`), SDK scripts, Infrastructure-as-Code (Terraform / CloudFormation / Bicep), cloud-specific MCP servers, or a PaaS in front of the clouds.

## Decision

Skills instruct the agent to run `aws` (v2), `gcloud` and `az` (plus `jq`, `curl`, `docker`, `ssh`). Raw REST is used only where no CLI command exists (GCP time-series metrics and the GCP price list), with the token kept out of the process list.

## [Trade-off Analysis]

**Pros**
- Reuses the user's existing login (SSO / browser) — the plugin never holds credentials.
- Nothing to host or install beyond tools engineers already have; skills stay plain markdown.
- Commands are the same ones a human would run: reviewable, copyable, easy to explain.
- Structured output (`--output json`, `--query`, `--format=json`) is good enough for an agent.

**Cons**
- Imperative: no state, no drift detection, no plan/apply review.
- Output and flag semantics differ per cloud (see ERR-20261018-set-env-vars-opposite-semantics).
- Few real dry-runs (EC2 `--dry-run` is the exception).
- Needs three CLIs installed; AWS must be **v2** (see ERR-20261018-aws-cli-v1-lacks-v2-commands).

**Reason**
It is the shortest path from a sentence to working infrastructure with the least moving parts and the least credential handling. Where drift and review matter (long-lived production), the skills mention IaC once and then do what the user asked.

## Consequences

- Correctness depends on commands existing and meaning what the skill says → [ADR-0007](ADR-0007-verification-strategy-for-cli-commands.md).
- Safety cannot rely on the CLI → [ADR-0003](ADR-0003-safety-model-action-classes.md).
