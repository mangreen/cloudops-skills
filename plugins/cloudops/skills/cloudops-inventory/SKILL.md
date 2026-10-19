---
name: cloudops-inventory
description: Use when listing what is running or deployed — "what do I have in the cloud", "list my services", "what did you create", "show everything tagged managed_by", "what's running in this project / resource group", "列出我的服務", "雲上有哪些資源", "你建了什麼". Also use to find service names/IDs needed by other skills. Works on AWS, GCP and Azure; READ-only.
---

# CloudOps Inventory

> **Use only `aws` (v2), `gcloud`, `az`.** READ-class — run freely, but pass the target explicitly. Read `cloudops-core` first.

Two views: **what this plugin created** (by tag) and **what exists** (by category). Always separate the two in your answer — resources without `managed_by=cloudops_agent` belong to someone else.

## A. Everything the agent created (by tag)

```bash
# AWS — one region per call; Resource Groups Tagging API covers most resource types
aws resourcegroupstaggingapi get-resources --profile <p> --region <r> \
  --tag-filters Key=managed_by,Values=cloudops_agent \
  --query 'ResourceTagMappingList[].ResourceARN' --output text | tr '\t' '\n'

# Azure — whole subscription
az resource list --subscription <id> --tag managed_by=cloudops_agent \
  --query "[].{name:name, type:type, rg:resourceGroup, location:location}" -o table

# GCP — Cloud Asset Inventory (needs cloudasset.googleapis.com enabled; enabling is a CHANGE — ask)
gcloud asset search-all-resources --scope=projects/<id> --query='labels.managed_by=cloudops_agent' \
  --format="table(assetType,name,location)"
```

If Cloud Asset isn't enabled, fall back to per-type listing with a label filter:

```bash
gcloud compute instances list --project <id> --filter="labels.managed_by=cloudops_agent"
gcloud run services list      --project <id> --filter="metadata.labels.managed_by=cloudops_agent"
gcloud sql instances list     --project <id> --filter="settings.userLabels.managed_by=cloudops_agent"
gcloud storage buckets list   --project <id> --filter="labels.managed_by=cloudops_agent"
```

The AWS API is per region. For "everywhere", loop the enabled regions and say it will take a moment:

```bash
for r in $(aws ec2 describe-regions --profile <p> --query 'Regions[].RegionName' --output text); do
  echo "== $r"; aws resourcegroupstaggingapi get-resources --profile <p> --region $r \
    --tag-filters Key=managed_by,Values=cloudops_agent --query 'ResourceTagMappingList[].ResourceARN' --output text | tr '\t' '\n'
done
```

(Global resources such as IAM roles and Route 53 are not tagged-listed per region; check `us-east-1` for those.)

## B. What exists, by category (READ)

| Category | AWS | GCP | Azure |
|----------|-----|-----|-------|
| Container services | `aws ecs list-services --cluster default` | `gcloud run services list` | `az containerapp list -o table` |
| VMs | `cloudops-server-manage` list command | `gcloud compute instances list` | `az vm list -d -o table` |
| Databases | `aws rds describe-db-instances --query 'DBInstances[].{id:DBInstanceIdentifier,engine:Engine,class:DBInstanceClass,status:DBInstanceStatus}'` | `gcloud sql instances list` | `az postgres flexible-server list -o table` |
| Buckets / storage | `aws s3api list-buckets --query 'Buckets[].Name'` | `gcloud storage buckets list` | `az storage account list -o table` |
| Kubernetes | `aws eks list-clusters` | `gcloud container clusters list` | `az aks list -o table` |
| Load balancers | `aws elbv2 describe-load-balancers --query 'LoadBalancers[].{name:LoadBalancerName,dns:DNSName}'` | `gcloud compute forwarding-rules list` | `az network lb list -o table` |
| Container registries | `aws ecr describe-repositories` | `gcloud artifacts repositories list` | `az acr list -o table` |
| Secrets | `aws secretsmanager list-secrets --query 'SecretList[].Name'` | `gcloud secrets list` | `az keyvault list -o table` |
| Resource groups | — | — | `az group list -o table` |

Add `--project`/`--profile`/`--region`/`--subscription` to each. List **names and IDs, never secret values**.

## Present it

One table per cloud, grouped by category:

| Cloud | Type | Name | Region | State | Managed by agent? |
|-------|------|------|--------|-------|-------------------|

Call out anything that looks forgotten or costly (stopped VMs with disks, unattached disks/IPs, empty load balancers) and offer `cloudops-cost` / `cloudops-delete` — don't act on it unasked.

## Notes

- Tag propagation lags a few minutes after creation; a brand-new resource may not appear yet.
- Some resources can't be tagged (or inherit nothing from their resource group). Absence from the tag list is not proof something wasn't created — if you made it this session, you know its name.
- Azure tags on a resource group do **not** automatically apply to the resources inside it.
