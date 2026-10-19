# SKILL: Release
Version: 1.0
Domain: release management

## When to Use
Cutting a new plugin version (GitHub Flow release tag).

## Steps
1. Branch from `main`: `chore/release-vX.Y.Z`.
2. Re-verify time-sensitive facts in [MEM-0005](../memories/MEM-0005-environment-facts.md) (service availability, CLI behaviours); update the memory and affected skills together.
3. Bump `version` in **both** `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (the validator enforces equality).
4. Move the unreleased entries in `CHANGELOG.md` under the new version and date.
5. `npm run check` · `npm run sync` (must leave no diff) · `python3 tools/scripts/verify-cli-commands.py all` · gitleaks (`gitleaks detect --config .gitleaks.toml`).
6. Commit `chore(release): vX.Y.Z`; merge with `--no-ff`; delete the branch.
7. Tag on `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"`; push the tag.
8. Users update with `claude plugin marketplace update cloudops && claude plugin update cloudops@cloudops`.

## Caveats
- Do not release with failing gates or a stale `plugins/cloudops/`.
- State in the changelog anything still unverified (currently: `gcloud` commands, real-account runs).

## Example
`2.0.0`: bump both manifests, changelog entry, checks green, tag `v2.0.0`.
