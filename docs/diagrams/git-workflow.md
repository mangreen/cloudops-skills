# Git Workflow (GitHub Flow)

Decision record: [ADR-0006](../adr/ADR-0006-git-workflow-github-flow.md).

```mermaid
flowchart LR
  M0["main<br/>always green"] --> B["short-lived branch<br/>feature/* fix/* refactor/*<br/>test/* chore/*"]
  B --> T["commit = one complete,<br/>testable unit<br/>(Conventional Commit)"]
  T --> G{"CI gates pass?<br/>check · mirror · secrets"}
  G -- no --> T
  G -- yes --> PR["PR / --no-ff merge"]
  PR --> M1["main"]
  M1 --> D["delete branch"]
  M1 --> TAG["release tag vX.Y.Z"]
```

Commit format: `<type>(<scope>): <subject>` with types `feat`, `fix`, `test`, `refactor`, `docs`, `chore`. A skill-only change that cannot satisfy the cross-reference gate on its own (see the dependency findings in [`../architecture/overview.md`](../architecture/overview.md)) is validated at the PR, not per commit.
