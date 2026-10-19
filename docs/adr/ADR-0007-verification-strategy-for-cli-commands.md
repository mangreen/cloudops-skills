# ADR-0007: Verify commands against CLI schemas, not memory

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0005](../../.agents/memories/MEM-0005-environment-facts.md) · Skill: [SKILL-verify-cli-commands](../../.agents/skills/SKILL-verify-cli-commands.md)

## Context

Skills tell an agent which commands to run against billable infrastructure. A wrong flag fails loudly at best, silently does the wrong thing at worst. Research for this work already found several things memory got wrong (App Runner, the AWS CLI v1/v2 split, flag semantics).

## Decision

Verify statically, reproducibly, and without touching a cloud account:

| Layer | Method |
|-------|--------|
| AWS operations and flags | Compare against the AWS CLI's API model (`awscli.botocore`); allow-list v2-only customizations explicitly |
| Azure commands and flags | Probe real `az … --help` for every command prefix; allow-list extension commands |
| Shell / JMESPath | `bash -n`, `shellcheck -S error`, `jmespath.compile` on every fenced block / `--query` |
| `jq` pipelines | Exercised against mocked API responses when written |
| Structure | `scripts/validate-skills.mjs` (CI) |

Implemented in [`tools/scripts/verify-cli-commands.py`](../../tools/scripts/verify-cli-commands.py); run before each release.

## [Trade-off Analysis]

**Pros**
- Cheap, safe (creates nothing), repeatable; catches non-existent commands and flags — the most common agent failure.
- Planted-error tests show the verifier fails when it should.

**Cons**
- Proves existence, not behaviour: IAM, quotas, regional availability and semantics are untested.
- **`gcloud` cannot be installed in the build environment**; those blocks are unverified.
- AWS v2-only customizations (`logs tail`, `sso login`) are checked against documentation, not executed.
- The Azure probe takes ~2 minutes, so it is a manual release gate rather than a CI job.

**Alternatives**
- *Run against real sandbox accounts:* the right next step, not done yet ([`todo.md`](../../todo.md)).
- *Emulators (LocalStack, Azurite):* partial coverage of the services used; no GCP equivalent worth the setup.

**Reason**
Highest assurance per unit of effort, with the remaining gap stated openly instead of hidden.
