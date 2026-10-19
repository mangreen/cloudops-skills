# todo.md — Active sprint backlog

Phase: **Hardening before first public use** · Updated: 2026-10-18 · `[ ]` pending, `[x]` done

## Done
- [x] 20 multi-cloud skills with shared safety model
- [x] AWS operations/flags verified against the API model (103); Azure commands/flags against real `--help` (93); shell + JMESPath checked (127 blocks, 65 expressions)
- [x] Validator + Codex mirror sync refactored into testable libs; 31 tests; coverage gate; mutation check (11/11 killed)
- [x] CI: check, mirror, secrets (gitleaks); workflow linted with actionlint and every job simulated locally
- [x] Design docs: architecture overview, 5 diagrams, 8 ADRs, 5 MEM, 9 ERR, 3 SKILL
- [x] Atomic GitHub Flow history and release tag `v2.0.0`

## Next (highest value first)
- [ ] **Run end-to-end in sandbox accounts** (AWS, GCP, Azure): rent → manage → delete a VM; deploy a hello-world container; confirm `cloudops-inventory` by tag shows only agent-created resources and that cleanup leaves nothing billable
- [ ] **Review every `gcloud` block** against `gcloud --help` / Google's reference (not installable in the build environment); extend the verifier when `gcloud` is available
- [ ] Execute the AWS CLI **v2-only** commands (`logs tail`, `sso login`, `configure list-profiles`) with a real v2 install
- [ ] Create an ECS Express service to settle the `cpu`/`memory` unit conflict (ERR-20261018-ecs-express-cpu-memory-unit-conflict)
- [ ] Find or verify a CLI path for ECS Express **custom domains**; document it or keep the gap explicit
- [ ] Replace `<your-org>` in manifests, README and CHANGELOG links; set the real author
- [ ] Confirm upstream license terms (upstream has no LICENSE file) — see `NOTICE.md`
- [ ] Check in Codex that `.agents/skills/SKILL-*.md` files are not auto-loaded as repo skills (ADR-0008)
- [ ] Promote the `jq` mock fixtures (NSG/security-group audit, price derivation, config read-modify-write) into committed tests (ERR-20261018-network-audit-missed-plural-source-prefixes)
- [ ] Re-check App Runner / ECS Express availability and CLI shapes before each release (MEM-0005)

## Later
- [ ] Run the Azure command probe on a schedule in CI (~2 min) instead of manually
- [ ] Monthly report at month end
- [ ] Out of scope today, candidates: static-site and function hosting, IAM and VPC design, Kubernetes workloads, Azure budgets with notifications, domain registration
