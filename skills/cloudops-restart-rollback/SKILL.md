---
name: cloudops-restart-rollback
description: Use when restarting a service or rolling back a bad release — "restart the service", "redeploy the same version", "roll back", "go back to the previous version", "undo the last deploy", "shift traffic back", "the new release is broken", "重啟服務", "回滾", "退回上一版". On AWS (ECS Express Mode / ECS), GCP (Cloud Run revisions) and Azure (Container Apps revisions, App Service). For a VM reboot use cloudops-server-manage.
---

# CloudOps Restart & Rollback

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Both are **CHANGE** — a restart drops in-flight requests and a rollback replaces what is serving. **Confirm first for production** or when the user hasn't named the exact service.

A rollback is only possible if you know **what to go back to**. Before any deploy, remember the previous image tag / revision name (see `cloudops-deploy`). If you have to hunt for it, say what you found and let the user confirm.

## Decide: restart or roll back?

| Situation | Do |
|-----------|----|
| Service hung / leaking / needs to pick up changed external config | **Restart** |
| Errors started right after a deploy or config change | **Roll back** (then investigate) |
| Unsure | Read logs/metrics first (`cloudops-logs`, `cloudops-metrics`) — a restart can destroy evidence |

## GCP — Cloud Run

Every deploy or config change is a **revision**; rollback is a traffic switch, instant and non-destructive.

```bash
gcloud run revisions list --project <id> --region <r> --service <name> \
  --format="table(metadata.name, metadata.creationTimestamp, spec.containers[0].image)" --limit 8
gcloud run services describe <name> --project <id> --region <r> --format="value(status.traffic)"   # what serves now
```

```bash
# roll back: send 100% to a known-good revision
gcloud run services update-traffic <name> --project <id> --region <r> --to-revisions <good-revision>=100
# return to "always latest" later
gcloud run services update-traffic <name> --project <id> --region <r> --to-latest
```

**Restart:** Cloud Run has no restart button; force a new revision with a throwaway variable:

```bash
gcloud run services update <name> --project <id> --region <r> --update-env-vars RESTARTED_AT=$(date +%s)
```

If traffic is currently **pinned to a specific revision** (you just rolled back), the new revision is created but gets **no traffic** — follow with `--to-latest` only if the user wants to move forward again.

## Azure — Container Apps

```bash
az containerapp revision list --subscription <id> -g <rg> -n <name> \
  --query "[].{name:name, active:properties.active, traffic:properties.trafficWeight, created:properties.createdTime, image:properties.template.containers[0].image}" -o table
az containerapp ingress show --subscription <id> -g <rg> -n <name> --query traffic     # what serves now
```

Restart the replicas of a revision:

```bash
az containerapp revision restart --subscription <id> -g <rg> -n <name> --revision <revision>
```

Roll back — pick one:

1. **Simplest (any mode):** redeploy the previous image as a new revision.
   `az containerapp update --subscription <id> -g <rg> -n <name> --image <previous-image>:<tag>`
2. **Traffic switch (needs multiple-revision mode):** switching modes is itself a CHANGE — tell the user.
   ```bash
   az containerapp revision set-mode --subscription <id> -g <rg> -n <name> --mode multiple
   az containerapp revision activate --subscription <id> -g <rg> -n <name> --revision <good-revision>
   az containerapp ingress traffic set --subscription <id> -g <rg> -n <name> --revision-weight <good-revision>=100
   ```
   Afterwards deactivate the bad revision (`az containerapp revision deactivate …`) so it can't receive traffic.

**App Service:** `az webapp restart --subscription <id> -g <rg> -n <name>`; with deployment slots, a rollback is swapping back (`az webapp deployment slot swap`).

## AWS — ECS Express Mode

Express Mode has no restart or rollback command. **Rollback = update the service back to the previous image.** Find candidates (newest first) in ECR:

```bash
aws ecr describe-images --profile <p> --region <r> --repository-name <repo> \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[:6].{tags:imageTags,pushed:imagePushedAt}' --output table
```

Then do the read–modify–write update from `cloudops-deploy/references/aws-ecs-express.md` §6 with the good image (it preserves environment and secrets), and wait for the rollout to complete. **A mutable tag like `latest` can't be rolled back to** — if only `latest` exists, say so; you'd need a rebuild.

**Restart** (same image, fresh tasks): for plain ECS services use a forced new deployment; for Express Mode try the same and, if AWS rejects changes to a managed service, bump a throwaway variable via the `cloudops-config` read–modify–write (`RESTARTED_AT`):

```bash
aws ecs update-service --profile <p> --region <r> --cluster <cluster> --service <service> --force-new-deployment
```

**Plain (non-Express) ECS services** roll back to an older task definition revision:

```bash
aws ecs list-task-definitions --profile <p> --region <r> --family-prefix <family> --sort DESC --max-items 5
aws ecs update-service --profile <p> --region <r> --cluster <cluster> --service <service> --task-definition <family>:<revision>
```

ECS also has deployment circuit breakers with automatic rollback if enabled on the service — check `aws ecs describe-services … --query 'services[0].deploymentConfiguration'` before doing a manual one.

## After every restart/rollback (verify)

1. Wait for the platform to report healthy (bounded — same loops as `cloudops-deploy`).
2. Make a real request (`curl`) and read recent logs for errors.
3. Report: what was running before → what is running now, the downtime you caused, and the version you can return to.
4. If the rollback didn't fix it, say so — don't keep flipping versions. Move to `cloudops-troubleshoot` (it may be config, a dependency, or the database, not the code).

## Don'ts

- Don't roll back across a **database migration** without checking the old code works with the new schema — ask first.
- Don't delete the bad revision/image while someone may still need it for debugging; deactivate or leave it.
- Don't restart repeatedly as a "fix" — one restart tells you if it's transient; more just hides the cause.
