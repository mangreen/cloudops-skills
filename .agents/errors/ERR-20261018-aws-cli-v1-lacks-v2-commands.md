# ERR: Skills assumed AWS CLI v2 commands that do not exist in v1
Date: 2026-10-18
Severity: High

## Description
`aws configure list-profiles`, `aws sso login` and `aws logs tail` are used by `cloudops-auth` and `cloudops-logs`. On AWS CLI **v1** they fail with a usage error, so the skills would break for anyone still on v1.

## Root Cause
Found by running the commands against `awscli` 1.46.1 (the only AWS CLI installable in the build environment): `list-profiles`, `sso login` and `logs tail` are v2 customizations. The API model is shared between versions, which hid the difference in the first verification pass.

## Solution
Skills state **AWS CLI v2 required**; `cloudops-auth` checks `aws --version` starts with `aws-cli/2`; README prerequisites say so. The verifier lists v2-only customizations in an explicit allow-list.

## Prevention
Verify against the API model **and** keep an allow-list of CLI-level customizations; treat anything on that list as "checked against documentation, not executed" (stated in README and ADR-0007).
