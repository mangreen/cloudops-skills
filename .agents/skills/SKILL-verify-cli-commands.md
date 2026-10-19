# SKILL: Verify CLI commands in skills
Version: 1.0
Domain: quality / cloud CLIs

## When to Use
After adding or changing any `aws`, `az` or `gcloud` command, flag or `--query` in `skills/`, and before every release. Background: [ADR-0007](../../docs/adr/ADR-0007-verification-strategy-for-cli-commands.md).

## Steps
1. Set up (dev machine): `pip install awscli jmespath`; Azure CLI on `PATH`; `shellcheck` installed. In a clean environment use a venv for `az` (`python3 -m venv v && v/bin/pip install azure-cli`).
2. Run `python3 tools/scripts/verify-cli-commands.py all` (add `aws`, `az` or `shell` to run one part). Azure takes ~2 minutes (it probes `--help` for every command prefix).
3. For each problem: fix the skill, or — only if it is a known false positive — extend the matching allow-list in the script **with a comment saying why**.
4. For `gcloud` (not machine-verifiable here): run `gcloud <command> --help` or read Google's reference for every new command and flag, and note anything uncertain in the skill.
5. For `jq` pipelines: run them against a mock response that includes edge cases (missing keys, empty lists, singular vs plural fields) before committing.
6. Record any pitfall you discovered as an `ERR-` file.

## Caveats
- Existence is verified, not behaviour (IAM, quotas, regional availability, semantics).
- AWS v2-only customizations are checked against documentation, not executed.
- Commands that need CLI extensions (`az ssh vm`, `az monitor log-analytics query`) are allow-listed and must say so in the skill.
- The tool cannot detect "two commands on one line" — review that by eye.

## Example
```bash
pip install awscli jmespath
export PATH=/path/to/azvenv/bin:$PATH
python3 tools/scripts/verify-cli-commands.py all
# [aws] 103 distinct operations; problems: 0
# [az] 93 commands resolved, 2 extension commands allow-listed; problems: 0
# [shell] 127 bash blocks, 65 JMESPath expressions; problems: 0
```
