# Deploy Flow

Applies to [`cloudops-deploy`](../../skills/cloudops-deploy/SKILL.md). Decision record: [ADR-0004](../adr/ADR-0004-aws-default-deploy-target-ecs-express.md).

```mermaid
flowchart TD
  A([User: deploy this]) --> B["Read project<br/>Dockerfile? port? start command?"]
  B --> C{"Cloud chosen?"}
  C -- no --> C1["Ask one question"] --> D
  C -- yes --> D["Preflight (READ)<br/>identity, APIs / providers, existing service?"]
  D --> E{"Service already exists?"}
  E -- yes --> R["REDEPLOY same service<br/>(never create a duplicate)"]
  E -- no --> F["Confirm: SPEND + EXPOSE<br/>supporting resources, idle cost, public or private"]
  R --> G
  F -- yes --> G{"Target cloud"}
  F -- no --> X([Stop])
  G -- GCP --> G1["gcloud run deploy --source<br/>(Artifact Registry repo auto-created)"]
  G -- Azure --> G2["az containerapp up --source<br/>then tag what it created"]
  G -- AWS --> G3["build + push image to ECR<br/>IAM roles check<br/>create-express-gateway-service"]
  G1 --> H
  G2 --> H
  G3 --> W["Bounded wait: status ACTIVE and<br/>rollout COMPLETED and tasks running"] --> H
  H["Verify with a real HTTP request"] --> I{"HTTP < 500?"}
  I -- yes --> J(["Report: URL, what was created, cost,<br/>redeploy / rollback / delete"])
  I -- no --> K["Read logs, troubleshoot<br/>do not report success"]
```

AWS differs from the others: Express Mode takes **images only** (no source build), needs two IAM roles, and does not scale to zero. App Runner has been closed to new customers since 2026-04-30.
