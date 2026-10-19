# ADR-0004: AWS deploys to ECS Express Mode by default

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0005](../../.agents/memories/MEM-0005-environment-facts.md) · Pitfall: [ERR-20261018-app-runner-closed-to-new-customers](../../.agents/errors/ERR-20261018-app-runner-closed-to-new-customers.md)

## Context

The natural AWS counterpart of Cloud Run / Container Apps was App Runner. AWS's documentation states App Runner stopped accepting new customers on **2026-04-30** and points new workloads at Amazon ECS Express Mode (`aws ecs create-express-gateway-service`). Research during this work confirmed the API shape (two IAM roles + `primaryContainer`; status codes `ACTIVE | DRAINING | INACTIVE`).

## Decision

`cloudops-deploy` targets **ECS Express Mode** on AWS. Existing App Runner customers can keep using App Runner; the skill does not create new App Runner services.

## [Trade-off Analysis]

**Pros**
- Works for new accounts; AWS's recommended path; one command provisions Fargate, an ALB, auto-scaling and an HTTPS endpoint.
- Express Mode adds no charge of its own.

**Cons**
- **Images only** — no source build, so Docker and ECR are required (GCP and Azure can build from source).
- **No scale-to-zero:** at least one task plus a load balancer; a monthly cost floor the user must be told about.
- Newer feature: documentation and API disagree on `cpu`/`memory` units (see ERR-20261018-ecs-express-cpu-memory-unit-conflict).
- `update-express-gateway-service` replaces the whole `primaryContainer` (a partial update drops env vars and secrets).
- Custom-domain attachment has no verified CLI path (documented as a gap).

**Alternatives considered**
- *Lambda container images:* different model (functions), cold starts, 15-minute limit.
- *Manual ECS Fargate + ALB:* many resources and IAM pieces for the agent to get wrong.
- *EKS:* far heavier than "deploy this".

**Reason**
It is the only AWS option that stays close to "one command, managed" for a new account. The drawbacks are stated to the user before they confirm.

## Consequences

- AWS deploy has the most prerequisites (roles, ECR, Docker); [`references/aws-ecs-express.md`](../../skills/cloudops-deploy/references/aws-ecs-express.md) documents them with a tested readiness loop.
- Re-check the status of App Runner / Express Mode before each release (tracked in [`todo.md`](../../todo.md)).
