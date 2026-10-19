# MEM: Environment facts (time-sensitive)
Date: 2026-10-18
Status: Approved
Tags: [aws, gcp, azure, facts, verify-before-release]

## Summary
Cloud and tooling facts the skills depend on, **as of 2026-10-18**. Re-verify before each release — cloud CLIs and services change. Rationale: [ADR-0004](../../docs/adr/ADR-0004-aws-default-deploy-target-ecs-express.md), [ADR-0007](../../docs/adr/ADR-0007-verification-strategy-for-cli-commands.md).

## Details
### Context & Evolution (脈絡與演進)
Gathered while writing the skills (AWS / Google / Microsoft documentation, the AWS CLI API model, real `az --help`). Errors found are in [`../errors/`](../errors/).

### Specification
- **AWS:** CLI **v2 required** (`sso login`, `logs tail`, `configure list-profiles` do not exist in v1). App Runner closed to new customers **2026-04-30**; ECS Express Mode: images only, needs `ecsTaskExecutionRole` (trust `ecs-tasks.amazonaws.com`) and `ecsInfrastructureRoleForExpressServices` (trust `ecs.amazonaws.com`), status codes `ACTIVE|DRAINING|INACTIVE`, `update` replaces the whole `primaryContainer`, `cpu` = CPU units and `memory` = MiB per the API model (docs example disagrees). Cost Explorer endpoint is `us-east-1` and costs ≈ US$0.01 per request.
- **GCP:** `gcloud run deploy --source` auto-creates Artifact Registry repo `cloud-run-source-deploy`; builds use the Compute Engine default service account (may need `roles/run.builder`); Cloud SQL needs `--edition`; no `gcloud` command returns spend (use BigQuery billing export).
- **Azure:** CLI 2.91 has `az containerapp` built in; `az containerapp up` has **no `--tags`**; `az vm create` opens SSH to the internet unless `--nsg-rule NONE`; `az ssh vm`, `az monitor log-analytics query`, `az costmanagement` need extensions.
- **Build environment:** Node 22, Python 3, `jq`, `shellcheck`, `awscli` 1.x (model only), Azure CLI 2.91. **`gcloud` unavailable** — its commands are unverified.

## When to Use
When a cloud command behaves unexpectedly, before a release, or when a fact above may have changed (check provider docs, then update this file and the affected skill together).
