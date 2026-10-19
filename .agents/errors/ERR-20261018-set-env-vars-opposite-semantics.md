# ERR: `--set-env-vars` means opposite things on Cloud Run and Container Apps
Date: 2026-10-18
Severity: High

## Description
Using the same-looking flag on the wrong cloud either wipes every other environment variable (service outage) or does nothing destructive when the user expected a full replace.

## Root Cause
- **Azure** (verified in `az containerapp update --help`): `--set-env-vars` adds/updates; `--replace-env-vars` replaces all.
- **GCP Cloud Run** (from Google's documentation; **not executed here**): `--set-env-vars` replaces all; `--update-env-vars` merges.
- **AWS ECS Express**: `update-express-gateway-service` replaces the whole `primaryContainer` block.

## Solution
`cloudops-config` opens with a comparison table, says "never use a replace-all flag unless the user asked", shows current names first, and gives a read-modify-write recipe for AWS (jq tested, including a container with no env/secrets keys).

## Prevention
Any skill that edits configuration must state, per cloud, whether the operation merges or replaces. Verify the GCP side against `gcloud run services update --help` when `gcloud` is available.
