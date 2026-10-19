# ADR-0003: Safety model — action classes and priced / typed confirmation

Date: 2026-10-18 · Status: Accepted · Memory: [MEM-0003](../../.agents/memories/MEM-0003-safety-and-confirmation-rules.md) · Diagram: [action classification](../diagrams/action-classification.md)

## Context

An agent that can run cloud CLIs can run up a bill, expose a database, or delete production. A skills-only plugin has no runtime to enforce policy; the only lever is the instructions the agent follows.

## Decision

Classify every action — **READ, CHANGE, SPEND, EXPOSE, DESTROY, IAM** — and attach a confirmation rule to each (priced summary for SPEND, "who can reach what" for EXPOSE, named resources + backup offer + **typed name** for data-bearing DESTROY). Print the target (`cloud · account/project/subscription · region · environment`) and pass it explicitly on every command. Confirmation-bypass flags run only after consent. Never invent prices; never put secrets in chat or arguments where an alternative exists.

## [Trade-off Analysis]

**Pros**
- Friction is proportional: reads are free, irreversible actions are slow.
- Explicit targets remove the most common multi-cloud accident (wrong account / project / region).
- The same vocabulary appears in every skill, so reviewers can audit one table.

**Cons**
- **It is guidance, not enforcement.** A model that ignores the skill ignores the rules.
- Classification is a judgement call at the edges (is a restart a CHANGE or an outage?).
- Too many prompts cause fatigue; too few cause incidents.

**Reason**
It is the strongest control available to a markdown plugin. It must be backed by cloud-side controls the user owns: least-privilege profiles, budgets and alerts, organisation policies, deletion protection, backups.

## Consequences

- README states plainly that the plugin is not a sandbox.
- Deletion protection / termination protection / locks are never removed without a named, approved step.
