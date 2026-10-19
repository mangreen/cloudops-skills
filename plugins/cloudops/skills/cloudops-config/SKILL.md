---
name: cloudops-config
description: Use when changing application configuration — environment variables, secrets, settings — on a deployed service on AWS (ECS Express Mode, Secrets Manager), GCP (Cloud Run, Secret Manager) or Azure (Container Apps, Key Vault). Use when user says "set an env var", "add DATABASE_URL", "change the config", "rotate the secret", "list the variables", "改環境變數", "設定密鑰", "新增變數". Changing config creates a new revision/deployment (restarts the service).
---

# CloudOps Config — environment variables & secrets

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Changing config is **CHANGE** (it rolls a new revision, i.e. a restart — confirm for production). Granting a service access to a secret is **IAM** class.

## ⚠️ The same flag means different things on different clouds

| You want to… | GCP Cloud Run | Azure Container Apps | AWS ECS Express |
|--------------|---------------|----------------------|-----------------|
| Add/update one variable, keep the rest | `--update-env-vars K=V` | `--set-env-vars K=V` | read → modify → send whole block |
| **Replace ALL variables** | `--set-env-vars …` (!) | `--replace-env-vars …` | send a block with the new list |
| Remove one | `--remove-env-vars K` | `--remove-env-vars K` | drop it from the block |

On Cloud Run, `--set-env-vars` **wipes every variable you didn't list**; on Azure the same-named flag only adds/updates. **Never use a "replace all" flag unless the user asked to replace everything**, and show the current names first so nothing is lost by accident.

## Rules

1. **Read current config first** and show variable **names** (mask values whose key matches `KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE`).
2. **Secrets never go in chat, in command arguments, or in plain env vars.** Ask the user to put the value in a local file or env var in their own terminal (e.g. `read -rs -p "value: " V; printf %s "$V" > "$SECRET_FILE"; unset V`), then reference the file. Store it in the cloud's **secret manager** and give the service a *reference*.
3. If the user pastes a secret into chat anyway: use it only as needed, don't repeat it, and recommend rotating it.
4. A config change **restarts** the service. Say so; verify health afterwards (`curl`, `cloudops-logs`).
5. Don't print `env`/`printenv` from a server. Don't commit `.env` files.

## Environment variables

### GCP — Cloud Run

```bash
# read (names only)
gcloud run services describe <name> --project <id> --region <r> --format=json \
  | jq -r '.spec.template.spec.containers[0].env[]? | .name'

# add / update (merge)
gcloud run services update <name> --project <id> --region <r> --update-env-vars KEY=value
# remove
gcloud run services update <name> --project <id> --region <r> --remove-env-vars KEY
# many values or values with commas: a YAML file of KEY: "value" lines
gcloud run services update <name> --project <id> --region <r> --env-vars-file env.yaml
```

Each update creates a new revision and routes traffic to it — **unless traffic is pinned to a specific revision**, in which case add `--to-latest` or the change won't take effect (see `cloudops-restart-rollback`).

### Azure — Container Apps

```bash
az containerapp show --subscription <id> -g <rg> -n <name> \
  --query "properties.template.containers[0].env[].{name:name, secretRef:secretRef}" -o table

az containerapp update --subscription <id> -g <rg> -n <name> --set-env-vars KEY=value      # add/update (merge)
az containerapp update --subscription <id> -g <rg> -n <name> --remove-env-vars KEY
```

### AWS — ECS Express Mode

`update-express-gateway-service` replaces the whole `primaryContainer` block, so read it, change one entry, and send it all back. Sending only the new variable would drop `image`, `containerPort`, the other variables and secrets.

```bash
ARN=<service-arn>
CUR=$(aws ecs describe-express-gateway-service --profile <p> --region <r> --service-arn "$ARN" \
        --query 'service.activeConfigurations[0].primaryContainer' --output json)

# list names only
printf '%s' "$CUR" | jq -r '(.environment // [])[].name, ((.secrets // [])[] | "secret: " + .name)'

# add or replace one variable, keep everything else
NEW=$(printf '%s' "$CUR" | jq --arg k "KEY" --arg v "value" \
        '.environment = ((.environment // []) | map(select(.name != $k)) + [{name:$k, value:$v}])')
aws ecs update-express-gateway-service --profile <p> --region <r> --service-arn "$ARN" --primary-container "$NEW"
```

(`value` here ends up in the process list — for anything sensitive use a secret reference below.) Wait for the rollout with the loop in `cloudops-deploy/references/aws-ecs-express.md`.

## Secrets

Create the secret from a file or stdin (the user's file, deleted afterwards), then reference it.

### AWS — Secrets Manager → ECS `secrets`

```bash
aws secretsmanager create-secret --profile <p> --region <r> --name <app>/<KEY> \
  --secret-string "file://$SECRET_FILE" --tags Key=managed_by,Value=cloudops_agent --query ARN --output text
# new value for an existing secret:
aws secretsmanager put-secret-value --profile <p> --region <r> --secret-id <app>/<KEY> --secret-string "file://$SECRET_FILE"
```

Reference it from the container: add `{"name":"KEY","valueFrom":"<secret-arn>"}` to `secrets` in the `primaryContainer` JSON (same read-modify-write as above). The **task execution role** must be allowed `secretsmanager:GetSecretValue` on that secret — an IAM change: show the user the exact statement scoped to that one ARN and get confirmation; never attach `SecretsManagerReadWrite`. Note: `file://` includes a trailing newline if the file has one — write it with `printf %s`.

### GCP — Secret Manager → Cloud Run

```bash
gcloud secrets create <name> --project <id> --data-file="$SECRET_FILE" --replication-policy=automatic --labels=managed_by=cloudops_agent
gcloud secrets versions add <name> --project <id> --data-file="$SECRET_FILE"          # rotate

# let the service's runtime identity read it (IAM — confirm first)
SA=$(gcloud run services describe <svc> --project <id> --region <r> --format="value(spec.template.spec.serviceAccountName)")
gcloud secrets add-iam-policy-binding <name> --project <id> --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"

# expose as env var (merge) — use `latest` to follow rotations, a number to pin
gcloud run services update <svc> --project <id> --region <r> --update-secrets KEY=<name>:latest
```

If `SA` is empty the service runs as the default Compute Engine service account; say so and ask whether to grant that or use a dedicated account. Avoid `--set-secrets` (replaces all secret bindings).

### Azure — Key Vault → Container Apps

Prefer a **Key Vault reference** so the secret value never touches a command line.

```bash
az keyvault secret set --subscription <id> --vault-name <vault> --name <KEY> --file "$SECRET_FILE" --tags managed_by=cloudops_agent -o none

az containerapp identity assign --subscription <id> -g <rg> -n <name> --system-assigned -o none
# grant that identity "get" on the vault (RBAC role "Key Vault Secrets User" or an access policy) — IAM, confirm first

az containerapp secret set --subscription <id> -g <rg> -n <name> \
  --secrets "<secretname>=keyvaultref:https://<vault>.vault.azure.net/secrets/<KEY>,identityref:system"
az containerapp update --subscription <id> -g <rg> -n <name> --set-env-vars "KEY=secretref:<secretname>"
```

Container App secret names are short (≤ 20 chars, lowercase, `-` allowed). `az containerapp secret set --secrets name=value` works but puts the value on the command line — avoid unless the user accepts that, and never for long-lived secrets. List secrets by **name** only: `az containerapp secret list -g <rg> -n <name> --query "[].name" -o tsv`.

## Verify

1. Re-read the config and confirm the variable/secret **name** is present (never print the value).
2. Wait for the new revision to be healthy and make a real request.
3. If the service now fails: read logs (`cloudops-logs`), and roll back (`cloudops-restart-rollback`) rather than piling on more changes.

## Not for VMs

On a server, config is files/environment on the box — use `cloudops-server-exec`, and keep secrets out of shell history (`read -s`, files with `chmod 600`).
