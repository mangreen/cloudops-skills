---
name: cloudops-auth
description: Use when checking which cloud CLIs are installed and logged in, logging in or out of AWS / Google Cloud / Azure, switching account, project or subscription, or answering "who am I", "which account am I on", "am I logged in". Use when user says "login", "log in", "登入", "logout", "登出", "switch project", "切換帳號", "切換訂閱", "auth status", or when any cloud command fails with an expired-credentials error.
---

# CloudOps Authentication & Context

> **Use only `aws` (v2), `gcloud`, `az`.** Read `cloudops-core` first. Identity checks are READ-class; logins are safe to run directly.

**AWS CLI v2 is required.** `aws sso login`, `aws logs tail` and `aws configure list-profiles` do not exist in v1. Check with `aws --version` (must start with `aws-cli/2`).

## 1. What is installed?

```bash
command -v aws gcloud az
aws --version 2>&1 | head -1
gcloud --version 2>&1 | head -1
az version --query '"azure-cli"' -o tsv 2>/dev/null
```

If one is missing, tell the user and point to the official installer (AWS CLI v2 install guide, `cloud.google.com/sdk/docs/install`, `learn.microsoft.com/cli/azure/install-azure-cli`). Don't install system software without asking.

## 2. Who am I, and where? (always do this before changing anything)

### AWS

```bash
aws configure list-profiles                                    # which profiles exist
aws sts get-caller-identity --profile <profile> --output json  # account, ARN — proves the credentials work
aws configure get region --profile <profile>                   # default region (may be empty)
aws iam list-account-aliases --profile <profile> --query 'AccountAliases[0]' --output text   # human name, if any
```

A profile with no region configured must get an explicit `--region` on every command.

### GCP

```bash
gcloud auth list --format=json                  # accounts; the ACTIVE one is what commands use
gcloud config list --format=json                # default project / region / zone
gcloud projects list --format="table(projectId,name,projectNumber)"
gcloud billing projects describe <project-id> --format="value(billingEnabled)"   # SPEND needs this = True
```

### Azure

```bash
az account show -o json
az account list --query "[].{name:name, id:id, isDefault:isDefault, state:state}" -o table
```

Azure ties everything to a **subscription**; the same login can see several. Make the user pick one if more than one is `Enabled` — don't use whichever is the default.

## 3. Log in

Run these directly. The CLI opens the browser for the user:

```bash
aws sso login --profile <profile>
gcloud auth login
az login
```

Headless / remote shells:

```bash
gcloud auth login --no-launch-browser
az login --use-device-code
```

Tools that use client libraries (Terraform, SDK scripts, `gcloud`-adjacent tools) read **Application Default Credentials** on GCP: `gcloud auth application-default login`.

**Interactive setup wizards must be run by the user**, not by you: `aws configure sso`, `gcloud init`. Tell them: "Run `aws configure sso` in your terminal (in Claude Code: `! aws configure sso`), then tell me the profile name."

### Credential hygiene

- Prefer **SSO / short-lived credentials** (`aws sso login`, `gcloud auth login`, `az login`) over long-lived access keys.
- **Never ask the user to paste an access key, secret key, service-account JSON, or token into the chat.** If they only have static keys, tell them to run `aws configure --profile <name>` themselves.
- Never use root/owner credentials for routine work. If the active identity is the AWS root user (ARN ends in `:root`), say so and recommend an IAM/SSO identity.
- Never write credentials into the repo or print them.

## 4. Pick the working context

Do **not** rely on a global default. Decide the target once, say it back (see `cloudops-core` "context line"), then pass it on every command:

| | Pass on every command |
|---|---|
| AWS | `--profile <p> --region <r>` |
| GCP | `--project <id>` and `--region`/`--zone` where relevant |
| Azure | `--subscription <id>` and `-g <resource-group>` / `--location` |

Changing the global default is a local config change, not a cloud change, but it silently affects every later command. Only do it if the user asks ("make this my default project"):

```bash
gcloud config set project <project-id>
az account set --subscription <id>
```

## 5. Prerequisites that look like auth problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| GCP `SERVICE_DISABLED` / "API has not been used" | API not enabled for the project | `gcloud services enable <api>.googleapis.com --project <id>` (CHANGE; tell the user which API) |
| GCP "billing account … is not open" | Project has no billing | User must link billing in the console; don't proceed with SPEND |
| Azure `MissingSubscriptionRegistration` | Resource provider not registered | `az provider register --namespace <Microsoft.X> --subscription <id>`; check with `az provider show -n <ns> --query registrationState -o tsv` |
| AWS `ExpiredToken` / `Token has expired` | SSO session ended | `aws sso login --profile <p>` |
| GCP "Reauthentication failed" / `invalid_grant` | Session expired | `gcloud auth login` |
| Azure `AADSTS70043` / "refresh token has expired" | Session expired | `az login` |
| AWS opt-in region "not enabled" | Region disabled for the account | User must enable it in the account settings |

## Logout

```bash
aws sso logout --profile <profile>
gcloud auth revoke <account>
az logout
```

## Tips

- Run the identity check **before** suggesting a login — the user may already be logged in.
- If the identity is not the one the user expects ("I thought I was on the staging account"), stop and surface it before doing anything else.
- Report the context line in your reply every time the target changes.
