---
name: cloudops-deploy
description: Use when deploying an application, service or container to the cloud — "deploy this", "put it online", "ship it to AWS / GCP / Azure", "host this app", "redeploy", "release the new version", "部署這個專案", "上線", "發布新版本". Deploys to managed container services — Google Cloud Run, AWS ECS Express Mode, Azure Container Apps — from a Dockerfile, plain source (GCP/Azure), or an existing image. Creates billable and possibly public resources — requires confirmation.
---

# CloudOps Deploy

> **Use only `aws` (v2), `gcloud`, `az`** (plus `docker` where required). Read `cloudops-core` first. Deploying is **SPEND** (new billable resources) and often **EXPOSE** (a public URL). Redeploying an existing service is CHANGE.

Per-cloud commands live in `references/`:

- `references/gcp-cloud-run.md` — `gcloud run deploy`
- `references/aws-ecs-express.md` — ECS Express Mode (**AWS's recommended replacement for App Runner, which is closed to new customers since 2026-04-30**)
- `references/azure-container-apps.md` — `az containerapp up`

## Which target?

| Situation | GCP | AWS | Azure |
|-----------|-----|-----|-------|
| Web app / API from source **without** a Dockerfile | Cloud Run `--source .` (buildpacks) | Needs an image first — build it (see ref) | Container Apps `up --source .` (buildpacks) |
| Has a Dockerfile | Cloud Run `--source .` | Build + push to ECR, then Express Mode | Container Apps `up --source .` |
| Already has an image in a registry | Cloud Run `--image` | Express Mode (execution role must be able to pull it) | Container Apps `--image` |
| Scale to zero (pay ~nothing when idle) | ✅ default | ❌ Express Mode keeps ≥1 task + a load balancer | ✅ default |
| Static site / SPA only | Cloud Storage + CDN / Firebase Hosting | S3 + CloudFront / Amplify | Static Web Apps |
| Serverless functions | Cloud Run functions | Lambda | Azure Functions |
| One VM running docker compose | `cloudops-server-rent` | `cloudops-server-rent` | `cloudops-server-rent` |

Static sites and function runtimes are **out of scope** for this skill — say so and offer the nearest option rather than forcing them into a container.

If the user didn't name a cloud, ask (`cloudops-core` Step 1). If they only say "cheapest", Cloud Run / Container Apps scale to zero; AWS Express Mode has a fixed floor (load balancer + at least one Fargate task).

## Workflow

### 1. Understand the project (READ)

```bash
ls; cat Dockerfile 2>/dev/null | head -40
```

Find: language/framework, whether a `Dockerfile` exists, **the port the app listens on** (`EXPOSE`, `PORT`, framework default), the start command, a health endpoint, required env vars. Don't guess the port — the #1 deploy failure is a port mismatch. If it's unclear, ask one question.

The app must **listen on `0.0.0.0`** (not `127.0.0.1`) and, on Cloud Run, honour the `PORT` env var.

### 2. Preflight (READ)

- `cloudops-auth` context check; print the context line.
- **Does the service already exist?** Check by name before creating anything (commands in the references). If it exists, this is a **redeploy** — reuse the same service; never create a duplicate.
- Required APIs / providers / roles exist (references list them).
- Local tooling: `docker` for AWS image builds.

### 3. ⚠️ Confirm (REQUIRED)

One message with: target (cloud/account/region), service name, **what will be created** (including supporting resources such as an Artifact Registry repo, ECR repo, Azure Container Registry, Log Analytics workspace, load balancer), **estimated cost and what bills while idle**, **who can reach it** (public URL or private), and tag `managed_by=cloudops_agent`.

Ask about exposure explicitly: **public** (anyone can call it) or **private/authenticated**. Default to private unless the user said it's a public website or API.

Redeploying an existing, non-production service: one-line announcement is enough. Production: confirm.

### 4. Deploy

Run the command from the cloud's reference. Prefer the single-command path (`gcloud run deploy --source`, `az containerapp up --source`). Don't bake secrets into the image or the command — use `cloudops-config`.

### 5. Verify (REQUIRED)

```bash
URL=<service url>
OK=0
for i in 1 2 3 4 5 6; do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$URL") && echo "HTTP $CODE" && [ "$CODE" -lt 500 ] && { OK=1; break; }
  sleep 10
done
[ "$OK" = 1 ] && echo "HEALTHY" || echo "NOT HEALTHY after retries"
```

A `401/403` on a deliberately private service is a pass. `5xx`, timeouts or "connection refused" → read logs (`cloudops-logs`) and use `cloudops-troubleshoot`. **Don't report success on "the command exited 0".**

### 6. Report

- URL, service name, region, cloud/account
- What was created (so cleanup is possible) and the estimated monthly cost
- How to redeploy (same command), roll back (`cloudops-restart-rollback`), view logs, and delete (`cloudops-delete`)
- Suggested next steps only if relevant (custom domain → `cloudops-domain-dns`, env vars → `cloudops-config`, database → `cloudops-database`)

Remember the **service identifier** (Cloud Run name+region, ECS service ARN, Container App name+resource group) for later turns. With the user's OK you may write it to `.cloudops/state.json` — add that path to `.gitignore` first; never store secrets there.

## Don'ts

- Don't create a second service because a redeploy "didn't work" — diagnose it.
- Don't open a service to the public implicitly.
- Don't use `latest` as the only image tag for production rollbacks to work — tag with a version or git SHA (rollback needs something to go back to).
- Don't delete or recreate supporting resources (registries, roles, environments) shared with other services.
