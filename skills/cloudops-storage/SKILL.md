---
name: cloudops-storage
description: Use when creating or managing object storage — buckets, containers, uploading/downloading files, sharing a file with a temporary link — on AWS (S3), GCP (Cloud Storage) or Azure (Blob Storage). Use when user says "create a bucket", "upload these files", "store backups in the cloud", "share this file", "make a presigned URL", "建立 bucket", "上傳檔案", "物件儲存". Buckets are private by default; making anything public is EXPOSE-class. Deleting a bucket with data is DESTROY (use cloudops-delete).
---

# CloudOps Storage

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Creating an empty bucket costs almost nothing, but **what you put in it, and who can read it, is the risk.** Public buckets are the classic data leak — default to private and confirm any exposure.

## Create a bucket (SPEND ≈ 0, but tag it and keep it private)

Names are **globally unique** (S3, GCS) or unique within the storage account (Azure). Check availability by trying — a "name taken" error is normal.

### AWS — S3

```bash
# us-east-1: omit --create-bucket-configuration. Every other region requires it.
aws s3api create-bucket --profile <p> --region <r> --bucket <name> \
  --create-bucket-configuration LocationConstraint=<r>

aws s3api put-public-access-block --profile <p> --bucket <name> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-tagging --profile <p> --bucket <name> --tagging 'TagSet=[{Key=managed_by,Value=cloudops_agent}]'
```

New buckets are encrypted at rest (SSE-S3) and block public access by default; setting the block explicitly makes it intentional. Optional: `aws s3api put-bucket-versioning --bucket <name> --versioning-configuration Status=Enabled` (protects against overwrites; stored versions cost money).

### GCP — Cloud Storage

```bash
gcloud storage buckets create gs://<name> --project <id> --location <region> \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://<name> --project <id> --update-labels=managed_by=cloudops_agent
```

### Azure — Blob Storage

Needs a **storage account** first (3–24 lowercase letters/digits, globally unique), then containers.

```bash
az storage account create --subscription <id> -g <rg> -n <account> -l <loc> \
  --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --min-tls-version TLS1_2 \
  --tags managed_by=cloudops_agent
az storage container create --account-name <account> -n <container> --auth-mode login
```

`--auth-mode login` uses the user's Entra identity; it needs a data-plane role such as **Storage Blob Data Contributor** on the account (an IAM change — ask, don't grant Owner). Without it you get `AuthorizationPermissionMismatch`.

## Upload / download / list (CHANGE, READ)

```bash
# AWS
aws s3 cp ./file s3://<bucket>/path/ --profile <p>
aws s3 sync ./dir s3://<bucket>/dir/ --profile <p>
aws s3 ls s3://<bucket>/ --profile <p>
aws s3 cp s3://<bucket>/path/file ./ --profile <p>

# GCP
gcloud storage cp ./file gs://<bucket>/path/
gcloud storage rsync ./dir gs://<bucket>/dir
gcloud storage ls gs://<bucket>/
gcloud storage cp gs://<bucket>/path/file ./

# Azure
az storage blob upload-batch --account-name <acct> -d <container> -s ./dir --auth-mode login
az storage blob list --account-name <acct> -c <container> --auth-mode login -o table
az storage blob download --account-name <acct> -c <container> -n <blob> -f ./file --auth-mode login
```

`sync`/`rsync` can **delete** at the destination when `--delete`/`-d` is used — never add that flag without confirmation (DESTROY). Check what's about to be uploaded: don't push `.env`, keys, or `.git`. Large uploads can take a while and bill for egress on download.

## Share a file temporarily (EXPOSE, time-limited)

Prefer an expiring link over making a bucket public. Pick the shortest useful lifetime and say it.

```bash
aws s3 presign s3://<bucket>/path/file --expires-in 3600 --profile <p>
az storage blob generate-sas --account-name <acct> -c <container> -n <blob> --permissions r \
  --expiry $(date -u -d '+1 hour' +%Y-%m-%dT%H:%MZ) --auth-mode login --as-user --full-uri -o tsv
# GCP: `gcloud storage sign-url gs://<bucket>/path/file --duration=1h --private-key-file=…` needs a service-account key
#      or impersonation (`--impersonate-service-account=…`); explain the requirement, don't create keys unasked.
```

The URL **is** the credential — don't paste it anywhere public, and tell the user who can use it until it expires. (macOS `date` needs `-v+1H` instead of `-d '+1 hour'`.)

## Making content public (EXPOSE — explicit confirmation REQUIRED)

Static website hosting or public downloads means anyone on the internet can read **everything you grant**. Before doing it:

1. State exactly which bucket/prefix and that it's readable by anyone.
2. Confirm nothing sensitive is inside (`ls` the contents and show the user).
3. Scope narrowly: a dedicated bucket for public assets, read-only, no listing.

Then relax only the specific setting required (AWS: remove the relevant public-access-block flag and add a bucket policy for `s3:GetObject` on the prefix; GCP: remove public-access-prevention and grant `allUsers` `roles/storage.objectViewer` on that bucket; Azure: allow blob public access on the account and set the container's access level to `blob`). Show the exact change, then apply. For websites, prefer a CDN in front.

## Deleting

Emptying/deleting buckets, containers or storage accounts is **DESTROY** — use `cloudops-delete` (it checks versioning, object counts, and requires the user to type the name).
