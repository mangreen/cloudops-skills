# ADR-0005: Tag everything `managed_by=cloudops_agent`

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0003](../../.agents/memories/MEM-0003-safety-and-confirmation-rules.md)

## Context

Inventory, cost reports and cleanup must find exactly what the agent created — and leave everything else alone. Tag/label rules differ: GCP labels allow lowercase letters, digits, `_` and `-`; AWS and Azure are more permissive.

## Decision

Use one key/value on every cloud: **`managed_by=cloudops_agent`** (underscores). Apply at creation where supported; otherwise tag immediately afterwards.

## [Trade-off Analysis]

**Pros**
- Valid on all three clouds; safe in `gcloud --filter` expressions.
- Enables `cloudops-inventory`, tag-filtered cost, and a hard rule: *no tag ⇒ not ours ⇒ no CHANGE/DESTROY without an explicit, named instruction*.

**Cons**
- Tags do not propagate everywhere: Azure resource-group tags do not flow to resources; AWS cost-allocation tags must be activated and only apply to later usage; some resources cannot be tagged.
- `az containerapp up` has no `--tags` — the skill tags the app and the resources it created in a follow-up step.
- Tags are convention, not security: anyone can add or remove them.

**Reason**
A uniform, filterable marker is the cheapest way to separate agent-created resources from the rest.

## Consequences

- `cloudops-delete` resolves "everything you created" by this tag, then lists exact IDs before deleting.
