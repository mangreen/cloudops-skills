# ERR: Designing the AWS deploy path around App Runner
Date: 2026-10-18
Severity: High

## Description
App Runner is the obvious AWS counterpart of Cloud Run and Container Apps. AWS's availability notice says it stopped accepting **new customers on 2026-04-30**, so a skill built on it fails for every new account.

## Root Cause
Training-data knowledge predates the change. Found by searching before writing the deploy skill.

## Solution
Default AWS deploys to **ECS Express Mode** ([ADR-0004](../../docs/adr/ADR-0004-aws-default-deploy-target-ecs-express.md)); the skill tells users about the trade-offs (images only, no scale-to-zero).

## Prevention
Re-check service availability for every managed service named in a skill before each release ([MEM-0005](../memories/MEM-0005-environment-facts.md)); search instead of recalling for anything that can change.
