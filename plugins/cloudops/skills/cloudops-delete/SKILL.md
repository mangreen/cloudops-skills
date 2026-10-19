---
name: cloudops-delete
description: Use when deleting, terminating, destroying or cleaning up cloud resources — "delete this service", "terminate the VM", "tear everything down", "clean up what you created", "remove the database", "stop paying for this", "刪除", "砍掉", "清理資源", "不要再收費". On AWS, GCP and Azure. DESTROY-class — irreversible; requires named resources, a backup offer and explicit confirmation (typed name for anything holding data).
---

# CloudOps Delete

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. This is **DESTROY**-class: you are the last line of defense. Nothing here is undone by saying sorry. Slow down, be specific, and never infer consent.

## The protocol (every time)

1. **Resolve the exact targets.** Turn the request into a concrete list of resource IDs/names, with cloud, account/project/subscription, region. Use `cloudops-inventory` — by tag for "everything you created" (`managed_by=cloudops_agent`), by explicit name otherwise. **Never delete by a wildcard or name pattern.** If the user's wording matches more than one resource, list them and ask which.
2. **Separate what's ours from what isn't.** Resources without `managed_by=cloudops_agent` weren't created by this plugin: delete them **only** if the user names them explicitly.
3. **Check what depends on it and what holds data.** Attached disks, Elastic/reserved IPs, load balancers, DNS records pointing at it, other services using the database, objects in a bucket, resource locks, deletion/termination protection.
4. **Offer a backup for anything with data** (snapshot, final DB snapshot, export). Take it first if the user says yes.
5. **Show the plan** (template below) with the blast radius, the irreversibility, and **what will keep billing afterwards**.
6. **Get explicit confirmation.** For **data-bearing or high-blast-radius** targets — databases, buckets/containers with objects, disks, clusters, storage accounts, **resource groups, projects** — the user must **type the resource name**. A "yes" is not enough there.
7. **Delete in dependency order**, one target at a time for the risky ones, stopping at the first unexpected error.
8. **Verify it is gone** (describe/list returns not-found) and **list what remains** that may still bill.

```
About to DELETE (cannot be undone):
  • RDS instance  orders-db   (120 GB, Postgres 16)   AWS 123456789012 / ap-northeast-1
  • Elastic IP    eipalloc-0abc…   (attached to nothing after this)
Not deleted, still billing: snapshot orders-db-final-20261018 (~120 GB), CloudWatch log group /aws/ecs/…
Backup: final snapshot will be taken first.
Type the instance name to confirm: 
```

**Never use `--skip-final-snapshot`, `--force`, `-y`, `--yes`, `--quiet`, `--no-wait` (on deletes), or `rm -rf`-style recursion before the confirmation is in hand.** Those are your confirmation prompt; running them early removes the only one.

**Production guard:** if the account, project, resource group or tags look like `prod`, also restate "this is production" in the plan.

**Don't retry blindly after a timeout** — look first; the delete may have succeeded or half-applied.

## Delete commands by resource type

(add the target flags from `cloudops-core` to every command)

### Container services

| Cloud | Command | Leaves behind (check and report) |
|-------|---------|----------------------------------|
| AWS ECS Express | `aws ecs delete-express-gateway-service --service-arn <arn>` | ECR repo + images, CloudWatch log group, the two IAM roles (shared — never delete them without asking), possibly the shared load balancer |
| GCP Cloud Run | `gcloud run services delete <name> --region <r> --quiet` | Artifact Registry repo `cloud-run-source-deploy` (shared across services in the region), secrets, Cloud Build artifacts |
| Azure Container Apps | `az containerapp delete -g <rg> -n <name> --yes` | Container Apps environment, Log Analytics workspace, container registry — these are **billable** and shared; ask before removing |

### VMs

| Cloud | Command | Leaves behind |
|-------|---------|---------------|
| AWS EC2 | `aws ec2 terminate-instances --instance-ids <id>` (check `disableApiTermination` first: `aws ec2 describe-instance-attribute --instance-id <id> --attribute disableApiTermination`) | Extra EBS volumes (root usually deletes), Elastic IP (`aws ec2 release-address --allocation-id <id>`), security group, key pair |
| AWS Lightsail | `aws lightsail delete-instance --instance-name <n>` | static IPs, snapshots |
| GCP | `gcloud compute instances delete <n> --zone <z> --quiet` | non-boot disks (kept unless `--delete-disks=all`), reserved addresses, the firewall rule you created |
| Azure | `az vm delete -g <rg> -n <n> --yes` | **OS disk, NIC, public IP, NSG** — Azure does not delete them with the VM. Delete by explicit resource ID (`az resource delete --ids …`) or, if the VM has its own dedicated resource group, the group (see below) |

### Databases (always back up; typed name)

```bash
# AWS — turn off protection, then delete with a FINAL SNAPSHOT
aws rds modify-db-instance --db-instance-identifier <id> --no-deletion-protection --apply-immediately
aws rds delete-db-instance --db-instance-identifier <id> --final-db-snapshot-identifier <id>-final-$(date +%Y%m%d)

# GCP
gcloud sql backups create --instance <id> --project <p>                        # backup first
gcloud sql instances patch <id> --project <p> --no-deletion-protection
gcloud sql instances delete <id> --project <p> --quiet

# Azure
az postgres flexible-server delete -g <rg> -n <name> --yes
```

Removing deletion protection is itself a step the user must understand — name it in the plan. Final/automated backups can keep billing; tell the user how long they're retained.

### Buckets / storage (typed name; check contents first)

```bash
aws s3 ls s3://<bucket> --recursive --summarize | tail -2            # object count + size
aws s3api get-bucket-versioning --bucket <bucket>                     # versioned buckets need versions removed too
aws s3 rb s3://<bucket> --force                                       # empties then deletes — only after confirmation

gcloud storage ls --recursive gs://<bucket> | wc -l
gcloud storage rm --recursive gs://<bucket>                           # deletes objects AND the bucket

az storage account delete -g <rg> -n <account> --yes                  # deletes every container inside
```

A versioned S3 bucket isn't empty after `--force` (old versions and delete markers remain) — say so and don't claim success until `aws s3api head-bucket` reports it gone.

### Security groups, firewall rules, DNS, secrets

Small, but they matter: leftover open rules and dangling DNS records are risks, not just clutter.

```bash
aws ec2 delete-security-group --group-id <sg>          # fails while still referenced — expected
gcloud compute firewall-rules delete <name> --project <id> --quiet
az network nsg rule delete -g <rg> --nsg-name <nsg> -n <rule>
```

Deleting a **DNS record** that still serves traffic is an outage; check with `dig` and `cloudops-domain-dns` first. Secrets: deleting a secret that a running service references breaks that service.

### Whole resource groups, projects, accounts (highest blast radius)

```bash
az resource list -g <rg> -o table                      # SHOW THE USER EVERYTHING inside
az lock list -g <rg> -o table                          # locks block deletion on purpose — report, don't remove
az group delete -g <rg> --yes --no-wait                # deletes EVERYTHING inside, irreversibly

gcloud projects delete <project-id> --quiet            # shut down; recoverable for ~30 days via `gcloud projects undelete`
```

Only delete a resource group the plugin **created itself in this session/for this purpose**; confirm every resource in it is ours (tags). If it contains anything else, **delete the individual resources instead**. A project or resource group deletion requires the user to type its **exact ID/name**. Never delete an AWS account, a GCP organisation/folder, or an Azure subscription — refuse and explain it's out of scope.

## After deleting (verify and report)

Re-run the `cloudops-inventory` tag listing for the same scope — nothing of ours should remain.

Report: what was deleted (names), what was verified gone, **what still exists and may still bill** (snapshots, registries, log groups, IPs, workspaces) with an offer to clean those up too, and the approximate effect on the monthly bill if you can back it with a price.

## Don'ts

- Don't delete "just to retry a failed deploy" — fix the cause (`cloudops-troubleshoot`).
- Don't delete shared infrastructure (IAM roles, registries, environments, VPCs) as a side effect of deleting one app.
- Don't remove protections (deletion protection, locks, termination protection) except as an explicit, named step the user has approved.
- Don't proceed on partial information. If you can't tell what something is or who owns it, ask.
