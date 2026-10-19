# Request Lifecycle

How one natural-language request becomes CLI calls. Source of truth: [`cloudops-core`](../../skills/cloudops-core/SKILL.md). Rules: [ADR-0003](../adr/ADR-0003-safety-model-action-classes.md).

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant A as Agent
  participant C as cloudops-core
  participant S as Action skill
  participant CLI as aws / gcloud / az
  participant Cloud

  U->>A: "Deploy this to the cloud"
  A->>C: load (description matches)
  C->>A: Step 1 pick cloud (ask if ambiguous)
  A->>S: route via cloudops-auth, then cloudops-deploy
  S->>CLI: READ preflight (identity, existing resources)
  CLI->>Cloud: describe / list
  Cloud-->>A: current state
  A->>U: Target: cloud · account · region · environment
  alt SPEND / EXPOSE / DESTROY
    A->>U: priced / exposure / named-resource summary
    U-->>A: explicit yes (typed name for data-bearing deletes)
  else READ / CHANGE
    A->>U: one-line announcement (confirm if production)
  end
  A->>CLI: run command (explicit --profile/--project/--subscription)
  CLI->>Cloud: create / update / delete
  A->>CLI: bounded wait, then re-describe
  A->>Cloud: real request (curl) when serving traffic
  A->>U: result + cost + how to undo
```

Invariants: the target is stated before any change; confirmation-bypass flags (`--yes`, `--quiet`, `--force`) run only after the user said yes; a timed-out create/delete is never retried before looking at the current state.
