# Architecture Decision Records

One file per significant decision, `ADR-NNNN-<topic>.md`. Status values: `Accepted`, `Superseded by ADR-NNNN`, `Supersedes ADR-NNNN`. When a decision is replaced, **both** files are updated (old → "Superseded by", new → "Supersedes"). Each ADR has a matching operational summary in [`../../.agents/memories/`](../../.agents/memories/).

| ADR | Decision |
|-----|----------|
| [0001](ADR-0001-use-official-clis-as-execution-layer.md) | Drive the clouds through their official CLIs |
| [0002](ADR-0002-provider-neutral-skills-by-intent.md) | Provider-neutral skills organised by intent |
| [0003](ADR-0003-safety-model-action-classes.md) | Safety model: action classes and priced / typed confirmation |
| [0004](ADR-0004-aws-default-deploy-target-ecs-express.md) | AWS deploys to ECS Express Mode by default |
| [0005](ADR-0005-resource-tagging-convention.md) | Tag everything `managed_by=cloudops_agent` |
| [0006](ADR-0006-git-workflow-github-flow.md) | GitHub Flow, Conventional Commits, release tags |
| [0007](ADR-0007-verification-strategy-for-cli-commands.md) | Verify commands against CLI schemas, not memory |
| [0008](ADR-0008-adapting-engineering-spec.md) | Adapting the engineering spec to a docs-only plugin |
