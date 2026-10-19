# Action Classification and Required Confirmation

Every command an agent runs is classified before it runs. Definitions live in [`cloudops-core`](../../skills/cloudops-core/SKILL.md); rationale in [ADR-0003](../adr/ADR-0003-safety-model-action-classes.md).

```mermaid
flowchart TD
  START([Command about to run]) --> Q1{"Reads only?"}
  Q1 -- yes --> READ["READ<br/>run freely<br/>(still pass explicit target)"]
  Q1 -- no --> Q2{"Deletes or destroys<br/>anything?"}
  Q2 -- yes --> DESTROY["DESTROY<br/>name every resource, state irreversibility,<br/>offer backup, explicit yes<br/>typed name if it holds data"]
  Q2 -- no --> Q3{"Changes who can reach it<br/>or who can do what?"}
  Q3 -- "network / public access" --> EXPOSE["EXPOSE<br/>say who can reach what<br/>default to narrowest scope"]
  Q3 -- "roles / policies" --> IAM["IAM<br/>treat as EXPOSE<br/>never grant admin to fix an error"]
  Q3 -- no --> Q4{"Creates billable resources<br/>or raises capacity?"}
  Q4 -- yes --> SPEND["SPEND<br/>priced summary + explicit yes<br/>(no invented prices)"]
  Q4 -- no --> Q5{"Production, or exact<br/>resource not named?"}
  Q5 -- yes --> CONFIRM["CHANGE + confirm first"]
  Q5 -- no --> ANNOUNCE["CHANGE<br/>one-line announcement, then run"]
```

Bypass flags (`--yes`, `--quiet`, `--force`, `--skip-final-snapshot`, `--no-wait` on deletes) are allowed **only** on the paths that already hold an explicit user confirmation.

| Class | Example | Gate |
|-------|---------|------|
| READ | `aws ec2 describe-instances` | none |
| CHANGE | update an env var, restart, roll back, edit DNS | announce (confirm on prod) |
| SPEND | create VM / database, scale up | priced explicit yes |
| EXPOSE | open 443 to the world, public bucket, unauthenticated service | exposure explicit yes |
| IAM | create role, attach policy | exposure explicit yes, narrowest policy |
| DESTROY | terminate VM, drop database, delete resource group | named + backup offer + yes / typed name |
