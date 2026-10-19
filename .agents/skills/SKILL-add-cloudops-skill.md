# SKILL: Add or change a cloudops skill
Version: 1.0
Domain: skills authoring

## When to Use
Adding a new `skills/cloudops-*` skill, renaming one, or substantially changing the commands in one.

## Steps
1. **Impact analysis first.** Read the dependency graph in [`docs/architecture/overview.md`](../../docs/architecture/overview.md#4-skill-dependency-graph-impact-graph). List which skills will reference the new/changed one and which it references.
2. **Write the test or check first** where one exists: for validator behaviour add a `should_…_when_…` test in `tests/`; for a skill, decide how its commands will be verified.
3. Create `skills/cloudops-<name>/SKILL.md`: frontmatter `name` (= directory) and `description` ≤ 1024 chars with English + 中文 trigger phrases → preamble (allowed CLIs, **safety class**, read `cloudops-core`) → workflow (ask → preflight → confirm → run → verify → report) → AWS / GCP / Azure sections → errors/tips. Put long per-cloud detail in `references/`.
4. Add the skill to the routing table in `cloudops-core`, the tables in `README.md` / `README.zh-TW.md`, and the lists in `CLAUDE.md` / `AGENTS.md`.
5. Run `npm run check`, then `python3 tools/scripts/verify-cli-commands.py all` ([SKILL-verify-cli-commands](SKILL-verify-cli-commands.md)).
6. Regenerate the mirror: `npm run sync`; commit `plugins/cloudops/`.
7. Update the dependency graph/table in `docs/architecture/overview.md` and write an ADR if the change is architectural.
8. Commit: `feat(skills): add cloudops-<name>`.

## Caveats
Review checklist (the verifier cannot see these):
- every fenced block is runnable as written — **one command per line**, `<placeholders>`, no literal `…`;
- every SPEND / EXPOSE / DESTROY path has a confirmation step, and bypass flags (`--yes`, `--quiet`, `--force`) come after it;
- the target is passed explicitly (`--profile/--region`, `--project`, `--subscription`);
- no secrets in arguments where a file/stdin/secret-manager alternative exists;
- created resources are tagged `managed_by=cloudops_agent`;
- merge-vs-replace semantics are stated for anything that edits configuration;
- skills added in one branch may reference each other before all exist; the cross-reference gate is checked at the PR ([ADR-0006](../../docs/adr/ADR-0006-git-workflow-github-flow.md)).

## Example
Adding `cloudops-queue` (managed queues): impact analysis shows it would be referenced by `deploy` and `troubleshoot` and would reference `config` and `delete`; tests unchanged; steps 3–8 as above.
