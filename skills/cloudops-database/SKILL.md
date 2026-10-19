---
name: cloudops-database
description: Use when creating, inspecting, backing up or restoring a managed database on AWS (RDS), GCP (Cloud SQL) or Azure (Database for PostgreSQL Flexible Server). Use when user says "create a database", "I need Postgres", "set up RDS / Cloud SQL", "back up the database", "take a snapshot", "資料庫", "建立 PostgreSQL", "備份資料庫". Creates billable, data-bearing resources — requires priced confirmation; deletion is DESTROY (use cloudops-delete).
---

# CloudOps Database

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Creating a database is **SPEND** (databases bill 24/7, even idle) and a **data-protection** decision. Examples use PostgreSQL; MySQL is the same pattern with a different engine value.

Managed databases are the most expensive thing an agent can create by accident. Default to **small, single-zone, private, encrypted, backed-up, deletion-protected**, and tell the user what that means for cost and availability.

## Ask first (only what's missing)

Engine/version (default: the cloud's current default Postgres), environment (dev vs production — production wants high availability and larger backups, which **multiplies the cost**), size, region (**same region as the app** — cross-region adds latency and egress), who needs to connect (the app only? the user's laptop?).

## ⚠️ Confirm before creating (REQUIRED)

One message: cloud/account/region, engine+version, instance size, storage, **estimated monthly cost** (instance + storage; excludes backups beyond the free allowance and egress — see `cloudops-catalog` for how to price; never invent), single-zone vs HA, backup retention, **network exposure** (private / no public access), encryption, deletion protection, and that it **bills until deleted**. Ask a direct yes/no.

## Credentials: no passwords in chat or in arguments

- **AWS:** `--manage-master-user-password` makes RDS generate the admin password and store it in Secrets Manager — no password ever appears on a command line.
- **GCP / Azure:** the CLI takes the admin password as an **argument** (`--root-password`, `--admin-password`), visible in the local process list for the moment the command runs. Generate it in the shell (`PW=$(openssl rand -base64 24 | tr -d '/+=')`), never echo it, store it straight into the secret manager (`cloudops-config`), and unset it. Tell the user this limitation; offer IAM / Entra database authentication as the stronger option.
- Never print connection strings with passwords. Show host, port, database, user.

## AWS — RDS

```bash
P=<profile>; R=<region>; ID=<db-name>
aws rds describe-db-engine-versions --profile $P --region $R --engine postgres --default-only --query 'DBEngineVersions[0].EngineVersion' --output text
```

```bash
aws rds create-db-instance --profile $P --region $R \
  --db-instance-identifier "$ID" --engine postgres --db-instance-class db.t4g.micro \
  --allocated-storage 20 --storage-encrypted \
  --master-username dbadmin --manage-master-user-password \
  --no-publicly-accessible --backup-retention-period 7 --deletion-protection \
  --tags Key=managed_by,Value=cloudops_agent

aws rds wait db-instance-available --profile $P --region $R --db-instance-identifier "$ID"     # several minutes
aws rds describe-db-instances --profile $P --region $R --db-instance-identifier "$ID" \
  --query 'DBInstances[0].{status:DBInstanceStatus, host:Endpoint.Address, port:Endpoint.Port, secret:MasterUserSecret.SecretArn}'
```

- Verify the instance class is offered for that engine/region before confirming (`aws rds describe-orderable-db-instance-options --engine postgres --db-instance-class db.t4g.micro --region $R --query 'OrderableDBInstanceOptions[0].DBInstanceClass'`).
- The instance lands in the **default VPC** and its **default security group**. To let an app connect, a security-group rule must allow the app's security group on port 5432 → `cloudops-network`. **Never** open 5432 to `0.0.0.0/0`.
- `--multi-az` doubles the instance cost; only for production and only when confirmed.
- The `wait` blocks (up to ~30 minutes); if it times out, `describe` the status instead of re-creating.

## GCP — Cloud SQL

```bash
PRJ=<project-id>; REGION=<region>; ID=<instance-name>
gcloud services list --project $PRJ --enabled --filter="config.name=sqladmin.googleapis.com" --format="value(config.name)"   # empty → enable first (CHANGE)

gcloud sql instances create "$ID" --project $PRJ --region $REGION \
  --database-version=POSTGRES_16 --edition=enterprise --tier=db-g1-small \
  --storage-size=10GB --storage-auto-increase --availability-type=zonal \
  --backup-start-time=03:00 --deletion-protection

# password: generated in-shell, stored in Secret Manager, never printed (see "Credentials" above)
gcloud sql users set-password postgres --project $PRJ --instance "$ID" --password "$PW"

gcloud sql instances patch "$ID" --project $PRJ --update-labels managed_by=cloudops_agent     # if your gcloud rejects --update-labels here, use `gcloud beta sql instances patch`
```

- Cloud SQL requires an **edition**; `db-g1-small` / `db-f1-micro` are shared-core Enterprise tiers, `db-custom-*` tiers also need `--edition=enterprise`. Pick the tier with the user (`gcloud sql tiers list --project $PRJ`).
- The instance gets a public IP but **no authorized networks** by default, i.e. nobody can connect directly. Connect through the **Cloud SQL Auth Proxy** or, from Cloud Run, `--add-cloudsql-instances <project>:<region>:<instance>`. Don't add `0.0.0.0/0` to `--authorized-networks`.
- Status: `gcloud sql instances describe "$ID" --project $PRJ --format="value(state,connectionName)"` until `RUNNABLE`.

## Azure — Database for PostgreSQL Flexible Server

Server names are globally unique, lowercase letters/digits/hyphens.

```bash
SUB=<subscription-id>; RG=<resource-group>; LOC=<location>; NAME=<server-name>
az postgres flexible-server create --subscription $SUB -g $RG -n "$NAME" -l $LOC \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
  --admin-user dbadmin --admin-password "$PW" \
  --public-access None --backup-retention 7 \
  --tags managed_by=cloudops_agent --yes
```

- `--public-access None` = no public endpoint (reach it via the app's virtual network / private access). If the user needs outside access, add a **specific IP** firewall rule instead — never `0.0.0.0` — and say it's EXPOSE-class.
- Check the SKU is available for the subscription/region first (`az postgres flexible-server list-skus --subscription $SUB -l $LOC -o table`) — region/SKU restrictions are common.
- Created inside a resource group — deleting the group deletes the server.

## Backups and restore

| | On-demand backup | Restore |
|---|---|---|
| AWS | `aws rds create-db-snapshot --db-instance-identifier $ID --db-snapshot-identifier $ID-$(date +%Y%m%d)` | restores always create a **new** instance (SPEND): `aws rds restore-db-instance-from-db-snapshot` / `…-to-point-in-time` |
| GCP | `gcloud sql backups create --instance $ID --project $PRJ` | `gcloud sql backups restore <backup-id> --restore-instance=$ID` **overwrites the target instance** (DESTROY-class) |
| Azure | automatic backups only (retention from `--backup-retention`) | `az postgres flexible-server restore -g $RG -n <new-name> --source-server $NAME --restore-time <UTC ISO time>` creates a new server (SPEND) |

A restore that **overwrites** data needs DESTROY-style confirmation (name the instance, state what is lost). Prefer restoring to a *new* instance, verifying, then switching the app.

## Verify and report

Re-describe the instance: status available/runnable, encrypted, not public, backup retention, deletion protection on. Report host/port/db/user, where the credentials live (the secret's **name**), the monthly estimate, and how to delete it (`cloudops-delete` — which will require backups/typed confirmation).

## Don'ts

- Don't create a public database "to make it easy to connect".
- Don't skip backups to save pennies, or set retention to 0.
- Don't resize/modify an instance in production without confirming (many changes cause a restart): AWS `modify-db-instance --apply-immediately` restarts now; omit it to apply in the next maintenance window and say so.
- Don't delete with a skip-final-snapshot style flag without the user explicitly accepting data loss.
