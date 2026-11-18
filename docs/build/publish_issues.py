#!/usr/bin/env python3
"""Validate and publish the v1 build issues from docs/build/issues.md.

Usage:
  python3 docs/build/publish_issues.py --plan              # validate DAG, print waves (no network)
  python3 docs/build/publish_issues.py --publish --repo OWNER/REPO [--dry-run]

Publishing creates labels, then every member issue in dependency order (so
{{KEY}} references resolve to real numbers), then the epic with a Sub-Issues
checklist, and finally links each member as a native GitHub sub-issue of the
epic. A state file (docs/build/.published.json, gitignored) makes reruns
idempotent: already-created keys are reused, never duplicated.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "issues.md"
STATE = HERE / ".published.json"
HEADER = re.compile(r"<!-- issue key=(\S+) labels=(\S*) depends=(\S*) -->")
FOOTER = (
    "\n\n---\n_Part of the v1 build. Source of truth: `docs/spec/` (see `docs/spec/README.md`). "
    "Follow `AGENTS.md` and the definition of done in `docs/spec/09-quality.md` §5. "
    "Reference this issue as `Refs #{num}`._\n"
)
LABEL_COLORS = {"epic": "5319e7", "v1": "0e8a16"}


def parse():
    text = SRC.read_text()
    parts = HEADER.split(text)
    issues = {}
    order = []
    for i in range(1, len(parts), 4):
        key, labels, deps, body = parts[i], parts[i + 1], parts[i + 2], parts[i + 3]
        m = re.search(r"^## (.+)$", body, re.M)
        if not m:
            sys.exit(f"{key}: missing '## title'")
        title = m.group(1).strip()
        body = body[m.end():].strip()
        issues[key] = {
            "key": key,
            "title": title,
            "labels": [l for l in labels.split(",") if l],
            "depends": [d for d in deps.split(",") if d],
            "body": body,
        }
        order.append(key)
    return issues, order


def waves(issues):
    members = {k: v for k, v in issues.items() if k != "EPIC"}
    for k, v in members.items():
        for d in v["depends"]:
            if d not in members:
                sys.exit(f"{k} depends on unknown {d}")
        for ref in re.findall(r"\{\{(\w+)\}\}", v["body"]):
            if ref not in members and ref != "MEMBERS":
                sys.exit(f"{k} references unknown {{{{{ref}}}}}")
    level = {}

    def depth(k, stack=()):
        if k in stack:
            sys.exit(f"cycle: {' -> '.join(stack + (k,))}")
        if k not in level:
            ds = members[k]["depends"]
            level[k] = 0 if not ds else 1 + max(depth(d, stack + (k,)) for d in ds)
        return level[k]

    for k in members:
        depth(k)
    out = {}
    for k, lv in level.items():
        out.setdefault(lv, []).append(k)
    return [sorted(out[i]) for i in sorted(out)]


def gh(args, dry):
    if dry:
        print("DRY:", " ".join(args[:6]), "...")
        return ""
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout.strip()


def publish(repo, dry):
    issues, _ = parse()
    ws = waves(issues)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    labels = sorted({l for v in issues.values() for l in v["labels"]})
    for l in labels:
        color = LABEL_COLORS.get(l, "c5def5")
        gh(["label", "create", l, "-R", repo, "--color", color, "--force"], dry)

    def render(v):
        body = v["body"]
        for k, num in state.items():
            body = body.replace("{{" + k + "}}", f"#{num}")
        return body

    members = [k for w in ws for k in w]
    for k in members:
        v = issues[k]
        if k in state:
            continue
        deps = ", ".join(f"#{state[d]}" for d in v["depends"]) or "none"
        body = f"**Depends on:** {deps}\n\n" + render(v) + FOOTER.format(num="<this issue>")
        url = gh(["issue", "create", "-R", repo, "--title", v["title"], "--body", body,
                  *sum((["--label", l] for l in v["labels"]), [])], dry)
        num = int(url.rstrip("/").split("/")[-1]) if url else len(state) + 1000
        state[k] = num
        if not dry:
            STATE.write_text(json.dumps(state, indent=2))
        print(f"{k} -> #{num} {v['title']}")
    # second pass: re-render every body so {{KEY}} refs and the footer carry real numbers
    for k in members:
        v = issues[k]
        if True:
            deps = ", ".join(f"#{state[d]}" for d in v["depends"]) or "none"
            body = f"**Depends on:** {deps}\n\n" + render(v) + FOOTER.format(num=f"#{state[k]}")
            gh(["issue", "edit", str(state[k]), "-R", repo, "--body", body], dry)
    # epic
    checklist = "\n".join(f"- [ ] #{state[k]}: {issues[k]['title']}" for k in members)
    epic = issues["EPIC"]
    ebody = epic["body"].replace("{{MEMBERS}}", checklist)
    if "EPIC" not in state:
        url = gh(["issue", "create", "-R", repo, "--title", epic["title"], "--body", ebody,
                  *sum((["--label", l] for l in epic["labels"]), [])], dry)
        state["EPIC"] = int(url.rstrip("/").split("/")[-1]) if url else 999
        if not dry:
            STATE.write_text(json.dumps(state, indent=2))
    else:
        gh(["issue", "edit", str(state["EPIC"]), "-R", repo, "--body", ebody], dry)
    print(f"EPIC -> #{state['EPIC']}")
    # native sub-issues (best effort; checklist above is the fallback)
    owner, name = repo.split("/")
    for k in members:
        try:
            node_id = gh(["api", f"repos/{repo}/issues/{state[k]}", "--jq", ".id"], dry)
            if not dry:
                gh(["api", "-X", "POST", f"repos/{owner}/{name}/issues/{state['EPIC']}/sub_issues",
                    "-F", f"sub_issue_id={node_id}"], dry)
        except subprocess.CalledProcessError as e:
            print(f"sub-issue link failed for {k}: {e.stderr.strip()[:200]}")
    print(json.dumps(state, indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--repo")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    issues, _ = parse()
    ws = waves(issues)
    if a.plan or not a.publish:
        for i, w in enumerate(ws):
            print(f"Wave {i}: " + ", ".join(f"{k} ({issues[k]['title'][:48]})" for k in w))
        print(f"{sum(map(len, ws))} member issues + epic")
    if a.publish:
        if not a.repo:
            sys.exit("--repo required")
        publish(a.repo, a.dry_run)


if __name__ == "__main__":
    main()
