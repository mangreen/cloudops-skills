#!/usr/bin/env python3
"""Verify that every CLI command written in skills/ really exists.

    python3 tools/scripts/verify-cli-commands.py aws       # aws ops/flags vs the AWS CLI API model
    python3 tools/scripts/verify-cli-commands.py az        # az commands/flags vs real `az ... --help`
    python3 tools/scripts/verify-cli-commands.py shell     # bash -n + shellcheck(error) + JMESPath compile
    python3 tools/scripts/verify-cli-commands.py all

Exit code 1 if anything unexplained is found. Requirements (dev machine, not CI):
  aws    pip install awscli          (v1 ships the same service model as v2)
  az     Azure CLI on PATH           (slow: probes `--help` for ~150 prefixes, ~2 min)
  shell  bash, shellcheck, `pip install jmespath` (installed with awscli)

NOT verifiable here: `gcloud` (review those blocks against Google's reference) and the
v2-only AWS customizations listed in AWS_CUSTOM_COMMANDS (checked against documentation).
"""
import concurrent.futures as cf, glob, json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MD_FILES = sorted(glob.glob(os.path.join(ROOT, "skills", "**", "*.md"), recursive=True))

def md_text(path):
    # Join backslash-continued shell lines so a command is analysed as one line.
    return re.sub(r"\\\n\s*", " ", open(path, encoding="utf-8").read())

def rel(path): return os.path.relpath(path, ROOT)

# ----------------------------------------------------------------------------- AWS
AWS_ALIAS = {"s3api": "s3"}
# CLI-level customizations (not in the API model); exist in AWS CLI v2.
AWS_CUSTOM_COMMANDS = {("logs", "tail"), ("ecr", "get-login-password"), ("s3", "cp"), ("s3", "sync"),
                       ("s3", "ls"), ("s3", "rb"), ("s3", "mb"), ("s3", "rm"), ("s3", "presign")}
AWS_CONFIG_COMMANDS = {("configure", "list-profiles"), ("configure", "get"), ("configure", "sso"),
                       ("configure", "set"), ("sso", "login"), ("sso", "logout")}
AWS_WAITER_SERVICES = {"ec2", "rds", "acm", "ecs", "eks"}
AWS_GLOBAL_FLAGS = {"profile", "region", "output", "query", "no-paginate", "no-cli-pager", "debug", "endpoint-url",
                    "generate-cli-skeleton", "cli-input-json", "max-items", "page-size", "starting-token", "help"}
AWS_CUSTOM_FLAGS = {
    ("ec2", "authorize-security-group-ingress"): {"protocol", "port", "cidr", "source-group"},
    ("ec2", "revoke-security-group-ingress"): {"protocol", "port", "cidr", "source-group"},
    ("ec2", "run-instances"): {"count"},                       # shorthand for Min/MaxCount
    ("logs", "tail"): {"since", "format", "filter-pattern", "follow", "log-stream-names", "log-stream-name-prefix"},
    ("s3", "presign"): {"expires-in"}, ("s3", "cp"): {"recursive"}, ("s3", "sync"): {"delete"},
    ("s3", "rb"): {"force"}, ("s3", "ls"): {"recursive", "summarize"},
}
AWS_PROSE_ALLOW = {"aws gcloud az"}            # "command -v aws gcloud az" is prose, not a command

def verify_aws():
    try:
        from awscli.botocore import session as bs
    except ImportError:
        print("aws: `pip install awscli` is required", file=sys.stderr); return None
    session, models, problems, checked = bs.get_session(), {}, [], set()
    def model(svc):
        if svc not in models: models[svc] = session.get_service_model(svc)
        return models[svc]
    for f in MD_FILES:
        for line in md_text(f).splitlines():
            for m in re.finditer(r"\baws ([a-z0-9]+) ([a-z][a-z0-9-]*)((?:\s+(?:--?[A-Za-z0-9-]+|[^\s|;&)`]+))*)", line):
                svc, op, rest = m.groups()
                if f"aws {svc} {op}" in AWS_PROSE_ALLOW: continue
                if svc in ("configure", "sso"):
                    if (svc, op) not in AWS_CONFIG_COMMANDS: problems.append((f, f"aws {svc} {op}", "unknown customization"))
                    continue
                real = AWS_ALIAS.get(svc, svc)
                if op == "wait":
                    if real not in AWS_WAITER_SERVICES: problems.append((f, f"aws {svc} wait", "no waiter for service"))
                    continue
                if (svc, op) in AWS_CUSTOM_COMMANDS: checked.add(f"aws {svc} {op}"); continue
                try: mdl = model(real)
                except Exception: problems.append((f, f"aws {svc} {op}", "unknown service")); continue
                name = next((o for o in mdl.operation_names if o.lower() == op.replace("-", "").lower()), None)
                if not name: problems.append((f, f"aws {svc} {op}", "operation not found")); continue
                checked.add(f"aws {svc} {op}")
                shape = mdl.operation_model(name).input_shape
                members = {k.lower() for k in (shape.members if shape else {})}
                for flag in re.findall(r"(?<!\S)--([a-z0-9-]+)", rest):
                    key = flag.replace("-", "")
                    ok = (flag in AWS_GLOBAL_FLAGS or key in members
                          or (flag.startswith("no-") and flag[3:].replace("-", "") in members)
                          or flag in AWS_CUSTOM_FLAGS.get((svc, op), set()) | AWS_CUSTOM_FLAGS.get((real, op), set()))
                    if not ok: problems.append((f, f"aws {svc} {op} --{flag}", "flag not in API model"))
    report("aws", f"{len(checked)} distinct operations", problems)
    return not problems

# ------------------------------------------------------------------------------ AZ
AZ_EXTENSION_COMMANDS = {"ssh vm", "monitor log-analytics query"}     # documented as needing an extension
AZ_GROUP_MENTIONS = {"containerapp", "containerapp auth"}              # named as a command group in prose
AZ_GLOBAL_FLAGS = {"--help", "--debug", "--verbose", "--output", "--query", "--subscription", "--only-show-errors"}
AZ_ERROR = re.compile(r"is misspelled|not recognized|invalid choice|is not in the|not a known|command group .* is not", re.I)

def verify_az():
    if subprocess.run(["az", "version"], capture_output=True).returncode != 0:
        print("az: Azure CLI not found on PATH", file=sys.stderr); return None
    uses = {}
    for f in MD_FILES:
        for line in md_text(f).splitlines():
            for m in re.finditer(r"(?<![\w/.-])az ((?:[a-z][a-z0-9-]*)(?: [a-z][a-z0-9-]*){0,4})((?:\s+[^\s|;&)`]+)*)", line):
                entry = uses.setdefault(tuple(m.group(1).split()), {"flags": set(), "file": f})
                entry["flags"].update(re.findall(r"(?<!\S)(--[a-z][a-z0-9-]*)", m.group(2)))
    prefixes = {" ".join(c[:n]) for c in uses for n in range(len(c), 0, -1)}
    env = {**os.environ, "AZURE_CORE_COLLECT_TELEMETRY": "false"}
    def probe(p):
        r = subprocess.run(["az", *p.split(), "--help"], capture_output=True, text=True, timeout=120, env=env)
        out = r.stdout + r.stderr
        return p, (None if r.returncode != 0 or AZ_ERROR.search(out) else out)
    with cf.ThreadPoolExecutor(max_workers=8) as ex: helps = dict(ex.map(probe, sorted(prefixes)))
    problems, resolved = [], 0
    for cmd, info in sorted(uses.items()):
        name = " ".join(cmd)
        if name in AZ_EXTENSION_COMMANDS or name in AZ_GROUP_MENTIONS: continue   # not verifiable / prose
        exact = helps.get(name)
        # NOTE: trailing lowercase words may be positional values, so fall back to shorter prefixes.
        text = exact or next((helps[" ".join(cmd[:n])] for n in range(len(cmd) - 1, 0, -1) if helps.get(" ".join(cmd[:n]))), None)
        if text is None:
            problems.append((info["file"], f"az {name}", "command not found")); continue
        lists_children = bool(re.search(r"^\s*(Subgroups|Commands):", text, re.M))
        has_own_arguments = "Arguments" in text.split("Global Arguments")[0]
        if exact and lists_children and not has_own_arguments:
            problems.append((info["file"], f"az {name}", "is a command GROUP, not a command")); continue
        resolved += 1
        for flag in sorted(info["flags"] - AZ_GLOBAL_FLAGS):
            if not re.search(re.escape(flag) + r"(?![\w-])", text): problems.append((info["file"], f"az {name} {flag}", "flag not in help"))
    report("az", f"{resolved} commands resolved, {len(AZ_EXTENSION_COMMANDS)} extension commands allow-listed", problems)
    return not problems

# --------------------------------------------------------------------------- SHELL
def verify_shell():
    problems, blocks, queries = [], 0, 0
    try: import jmespath
    except ImportError: print("shell: `pip install jmespath` is required", file=sys.stderr); return None
    for f in MD_FILES:
        text = open(f, encoding="utf-8").read()
        for m in re.finditer(r"```(?:bash|sh)\n(.*?)```", text, re.S):
            blocks += 1
            code = re.sub(r"<[^<>\n]+>", "X", m.group(1))             # placeholders -> a word
            with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as tf:
                tf.write("#!/bin/bash\n" + code); path = tf.name
            if subprocess.run(["bash", "-n", path], capture_output=True).returncode: problems.append((f, f"block #{blocks}", "bash -n failed"))
            if subprocess.run(["shellcheck", "-S", "error", "-s", "bash", path], capture_output=True).returncode:
                problems.append((f, f"block #{blocks}", "shellcheck error"))
            os.unlink(path)
        for m in re.finditer(r"--query\s+(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\")", md_text(f)):
            expr = m.group(1) if m.group(1) is not None else m.group(2).replace('\\"', '"').replace("\\`", "`")
            queries += 1
            try: jmespath.compile(expr)
            except Exception as e: problems.append((f, expr[:60], f"JMESPath: {str(e).splitlines()[0][:60]}"))
    report("shell", f"{blocks} bash blocks, {queries} JMESPath expressions", problems)
    return not problems

# -------------------------------------------------------------------------- common
def report(name, summary, problems):
    print(f"[{name}] {summary}; problems: {len(problems)}")
    for f, what, why in sorted({(rel(f), w, y) for f, w, y in problems}): print(f"  {f}: {what}  <-- {why}")

if __name__ == "__main__":
    targets = {"aws": verify_aws, "az": verify_az, "shell": verify_shell}
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which != "all" and which not in targets: sys.exit(__doc__)
    results = [targets[k]() for k in (targets if which == "all" else [which])]
    sys.exit(0 if all(r is True for r in results) else 1)
