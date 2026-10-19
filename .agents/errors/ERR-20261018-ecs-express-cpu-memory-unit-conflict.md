# ERR: ECS Express Mode docs and API disagree on `cpu` / `memory` units
Date: 2026-10-18
Severity: Medium

## Description
The AWS "create your first Express Mode service" page shows `--cpu 2 --memory 4`. The API model documents `cpu` in **CPU units** (default 256) and `memory` in **MiB** (default 512), as strings. Following the page literally would request a nonsensical size.

## Root Cause
Read from the vendored API model (`CreateExpressGatewayService` member docs) versus the published example. Unresolved on AWS's side as of 2026-10-18.

## Solution
The skill follows the API model, lists valid Fargate pairs (256/512 … 4096/8192) and **always verifies the applied size with `describe-express-gateway-service`** after creation.

## Prevention
When docs and the API schema disagree, trust the schema, say so in the skill, and add a read-back step.
