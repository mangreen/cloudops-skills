# ERR: Skill code blocks that look right but cannot be copied and run
Date: 2026-10-18
Severity: Medium

## Description
Found in self-review before release:
- two commands side by side on one line (`cloudops-storage`) — valid bash syntax, so `bash -n` cannot catch it;
- a literal `…` standing for "add target flags" in a resize block (`cloudops-server-manage`);
- `\|` escapes inside a table cell holding a `jq` pipeline (`cloudops-troubleshoot`) that copy as backslash-pipes;
- a pseudo-command inside a ```bash block (`cloudops-delete`).

## Root Cause
Optimising markdown for compactness. Agents copy code blocks literally.

## Solution
Rewrote each block as real, one-command-per-line shell; moved long pipelines out of tables. All 127 blocks now pass `bash -n` and `shellcheck -S error`.

## Prevention
Rule 11 in [MEM-0003](../memories/MEM-0003-safety-and-confirmation-rules.md); the verifier covers syntax. **The side-by-side case is not machine-detectable** — it stays on the review checklist in [SKILL-add-cloudops-skill](../skills/SKILL-add-cloudops-skill.md).
