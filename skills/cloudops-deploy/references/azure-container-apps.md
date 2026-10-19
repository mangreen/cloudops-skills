# Deploy on Azure — Container Apps

`az containerapp up` can deploy from an existing image, local source (Dockerfile, or buildpacks when none), or a GitHub repo. It creates the supporting pieces it needs (Container Apps environment, Log Analytics workspace, and for `--source` a container registry) — and **those are billable resources you must disclose in the confirmation**.

Variables: `SUB` = subscription ID, `RG` = resource group, `LOC` = location, `NAME`.

## 1. Preflight

Azure CLI 2.91 ships `az containerapp` built in. On older CLIs, if commands report missing parameters: `az extension add --name containerapp --upgrade`.

Resource providers must be registered once per subscription (CHANGE, free, takes a minute or two):

```bash
for ns in Microsoft.App Microsoft.OperationalInsights; do
  az provider show --subscription $SUB -n $ns --query registrationState -o tsv
done
# anything other than "Registered":
az provider register --subscription $SUB --namespace Microsoft.App
az provider register --subscription $SUB --namespace Microsoft.OperationalInsights
```

Resource group (reuse the user's; otherwise create and tell them its name — deleting it later removes everything in it):

```bash
az group show --subscription $SUB -n $RG -o none 2>/dev/null || \
  az group create --subscription $SUB -n $RG -l $LOC --tags managed_by=cloudops_agent -o none
```

Does the app already exist?

```bash
az containerapp show --subscription $SUB -g $RG -n $NAME --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null
```

A hostname means **redeploy**, not create.

## 2. Deploy from source

```bash
az containerapp up --subscription $SUB -g $RG -n $NAME -l $LOC \
  --source . --ingress external --target-port 8080
```

- `--target-port` — always pass it. With a Dockerfile `EXPOSE` it can be inferred, but with buildpacks it's required, and an explicit value avoids the classic port mismatch. The app must bind `0.0.0.0`.
- `--ingress external` = reachable from the internet (**EXPOSE** — confirm it); `--ingress internal` = reachable only from inside the environment's network. There is no "public but authenticated" switch in `up`; built-in authentication is configured separately (`az containerapp auth`) — offer it if the user needs login.
- Source upload limit is 200 MB — keep `.git`, `node_modules`, local env files out (`.dockerignore`).
- From an existing image: `--image <registry>/<image>:<tag>` (instead of `--source`). Private registries other than ACR: `--registry-server`, plus credentials — a password argument is visible in the process list; prefer an ACR with managed identity or ask the user to supply it another way.
- App env vars at deploy time: `--env-vars KEY=VAL …` (see `cloudops-config` for secrets).
- To redeploy to an existing app, pass the same `-g`, `-n` and `--environment <env-name>` (find it: `az containerapp env list --subscription $SUB -g $RG -o table`) so it doesn't create a second environment.

`az containerapp up` has **no `--tags`**. Tag what you created right after:

```bash
az containerapp update --subscription $SUB -g $RG -n $NAME --tags managed_by=cloudops_agent -o none
# supporting resources created by `up` (registry, environment, workspace):
az resource list --subscription $SUB -g $RG --query "[].id" -o tsv \
  | xargs az resource tag --tags managed_by=cloudops_agent --is-incremental --ids
```

`--is-incremental` adds the tag without wiping existing ones. Skip tagging resources that existed before you started (they aren't yours).

Show the user what exists afterwards so nothing billable is a surprise:

```bash
az resource list --subscription $SUB -g $RG -o table
```

## 3. URL and verification

```bash
FQDN=$(az containerapp show --subscription $SUB -g $RG -n $NAME --query properties.configuration.ingress.fqdn -o tsv)
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 15 "https://$FQDN"
az containerapp revision list --subscription $SUB -g $RG -n $NAME \
  --query "[].{name:name, active:properties.active, state:properties.runningState, traffic:properties.trafficWeight, created:properties.createdTime}" -o table
```

`runningState` other than `Running` (e.g. `Failed`, `Degraded`) → `az containerapp logs show -g $RG -n $NAME --type system --tail 100` (platform events) and `--type console` (app output); see `cloudops-logs`.

Cold start: with scale-to-zero the first request after idle can take seconds. Check the app's replica limits with `az containerapp show … --query properties.template.scale` — don't assume zero; if the user wants zero or a warm instance, set `--min-replicas` (`cloudops-scale`).

## 4. Typical errors

| Error | Fix |
|-------|-----|
| `MissingSubscriptionRegistration` | Register the provider named in the message (see Preflight) |
| `Failed to provision revision` / `ContainerAppOperationError` with port text | Target port ≠ the port the app listens on |
| Quota: `Operation cannot be completed without additional quota` | Region core quota → try another region or request more quota (`cloudops-troubleshoot`) |
| Build error from buildpacks | Add a `Dockerfile`; check the app has a recognisable entry point |
| Auth: `AuthorizationFailed` | Missing RBAC on the subscription/resource group → report; don't grant Owner |

## What bills

Container Apps vCPU-seconds/GiB-seconds while replicas run and requests (free grants apply on the Consumption plan), the **container registry** (a registry SKU is billed monthly), Log Analytics ingestion/retention, egress. The registry and workspace keep billing after the app is deleted — remove them via `cloudops-delete` if the user wants everything gone.
