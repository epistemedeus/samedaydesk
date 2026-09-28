#!/usr/bin/env python3
"""SDK-free Python wrapper around released useful-jobs vendor-budget-impact."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent.parent.parent
PINS = json.loads((ROOT / "pins.json").read_text())


def fail(code: str, message: str, extra: dict | None = None) -> None:
    body = {"ok": False, "refused": True, "code": code, "message": message, "purchaseAuthority": False, "updateBaseline": False}
    if extra:
        body.update(extra)
    sys.stdout.write(json.dumps(body) + "\n")
    raise SystemExit(2)


def parse_snapshot(obj, label: str) -> dict:
    errors = []
    rows = []
    if not isinstance(obj, dict):
        return {"ok": False, "errors": [f"{label}: snapshot must be a JSON object"], "rows": [], "fields": [], "capture_complete": True}
    if not isinstance(obj.get("rows"), list):
        return {"ok": False, "errors": [f"{label}: missing rows array"], "rows": [], "fields": [], "capture_complete": True}
    cap = obj.get("capture")
    capture_complete = True
    if cap == "partial":
        capture_complete = False
    elif isinstance(cap, dict) and cap.get("complete") is False:
        capture_complete = False
    for i, row in enumerate(obj["rows"]):
        at = f"{label}.rows[{i}]"
        if not isinstance(row, dict):
            errors.append(f"{at}: row must be an object")
            continue
        field, value, unit = row.get("field"), row.get("value"), row.get("unit")
        if not isinstance(field, str) or not field.strip():
            errors.append(f"{at}: field must be a non-empty string")
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value != value or value in (float("inf"), float("-inf")):
            errors.append(f"{at}: value must be a finite number")
            continue
        if not isinstance(unit, str) or not unit.strip():
            errors.append(f"{at}: unit must be a non-empty string")
            continue
        rows.append({"field": field.strip(), "value": float(value), "unit": unit.strip()})
    fields = sorted({r["field"] for r in rows})
    return {"ok": not errors, "errors": errors, "rows": rows, "fields": fields, "capture_complete": capture_complete}


def membership(before_rows, after_rows):
    b = {r["field"] for r in before_rows}
    a = {r["field"] for r in after_rows}
    return {"added": sorted(a - b), "removed": sorted(b - a), "shared": sorted(b & a)}


def unit_truth(before_rows, after_rows):
    def units(rows):
        out = {}
        for r in rows:
            out.setdefault(r["field"], set()).add(r["unit"])
        return out
    bu, au = units(before_rows), units(after_rows)
    mismatches = []
    for field in sorted(set(bu) & set(au)):
        if bu[field] != au[field] or len(bu[field]) != 1:
            mismatches.append({"field": field, "beforeUnits": sorted(bu[field]), "afterUnits": sorted(au[field])})
    return {"unitComparable": not mismatches, "mismatches": mismatches}


def arithmetic(before_rows, after_rows):
    bi = {r["field"]: r for r in before_rows}
    ai = {r["field"]: r for r in after_rows}
    out = []
    for field in sorted(set(bi) & set(ai)):
        b, a = bi[field], ai[field]
        if b["unit"] != a["unit"]:
            continue
        delta = a["value"] - b["value"]
        if delta != delta:
            continue
        out.append({"field": field, "before": b["value"], "after": a["value"], "delta": delta, "unit": b["unit"]})
    return out


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_released(archive: Path, spec: dict) -> Path:
    data = archive.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != spec["bytes"] or digest != spec["sha256"]:
        fail("kit-pin-mismatch", f"kit pin mismatch size={len(data)} sha256={digest}")
    dest = Path(tempfile.mkdtemp(prefix="hg04-uj-py-"))
    subprocess.run(["tar", "-xzf", str(archive), "-C", str(dest)], check=True)
    kit = dest / spec["rootName"]
    if not (kit / "bin/useful-jobs.mjs").exists():
        fail("kit-extract-missing", f"missing {kit / 'bin/useful-jobs.mjs'}")
    return kit


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="CI consumer for useful-jobs vendor-budget-impact")
    p.add_argument("command", nargs="?", default="run")
    p.add_argument("--before")
    p.add_argument("--after")
    p.add_argument("--source")
    p.add_argument("--baseline")
    p.add_argument("--fixture")
    p.add_argument("--out-dir")
    p.add_argument("--kit-dir")
    p.add_argument("--kit-archive")
    p.add_argument("--kit-version", default=PINS["defaultVersion"])
    p.add_argument("--usage")
    p.add_argument("--update-baseline", action="store_true")
    args = p.parse_args(argv)

    if args.command != "run":
        fail("unknown-command", f"unknown command {args.command}")
    if args.update_baseline:
        fail("baseline-update-refused", "This runner never updates expected.json.")
    if args.kit_version != PINS["released"]["version"]:
        fail("candidate-not-default", "Python wrapper uses released 1.4.0 unless you drive the Node wrapper with --allow-candidate.")

    before_path = Path(args.before) if args.before else None
    after_path = Path(args.after) if args.after else None
    source_path = Path(args.source) if args.source else None
    baseline_path = Path(args.baseline) if args.baseline else None
    if args.fixture:
        d = ROOT / "fixtures" / args.fixture
        before_path = before_path or d / "before.json"
        after_path = after_path or d / "after.json"
        source_path = source_path or d / "SOURCE.json"
        baseline_path = baseline_path or d / "expected.json"
    if not before_path or not after_path:
        fail("missing-required-inputs", "require --before and --after, or --fixture")

    before = json.loads(before_path.read_text())
    after = json.loads(after_path.read_text())
    source = json.loads(source_path.read_text()) if source_path and source_path.exists() else {}
    bp, ap = parse_snapshot(before, "before"), parse_snapshot(after, "after")
    schema_ok = bp["ok"] and ap["ok"]
    declared = [str(x).strip() for x in source.get("declaredFields") or [] if str(x).strip()]
    missing = [f for f in declared if f not in set(ap["fields"])]
    coverage_complete = bp["capture_complete"] and ap["capture_complete"] and source.get("capture", {}).get("complete", True) is not False and not missing
    mem = membership(bp["rows"], ap["rows"])
    units = unit_truth(bp["rows"], ap["rows"])
    arith = arithmetic(bp["rows"], ap["rows"])

    spec = PINS["released"]
    extract_root = None
    if args.kit_dir:
        kit = Path(args.kit_dir)
    else:
        archive = Path(args.kit_archive) if args.kit_archive else REPO / spec["inTreeArchive"]
        kit = extract_released(archive, spec)
        extract_root = kit.parent

    out_dir = Path(args.out_dir or (Path.cwd() / "out" / "vendor-change-ci-py"))
    kit_out = out_dir / "kit"
    kit_out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.setdefault("NODE_OPTIONS", "--max-old-space-size=768")
    proc = subprocess.run(
        ["node", str(kit / "bin/useful-jobs.mjs"), "run", "vendor-budget-impact", "--before", str(before_path), "--after", str(after_path), "--out-dir", str(kit_out)],
        cwd=str(kit),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    artifact = {}
    art_path = kit_out / "budget-impact.json"
    if art_path.exists():
        artifact = json.loads(art_path.read_text())
    kit_status = artifact.get("status")
    if not schema_ok:
        wrapper = "refused"
        kind, ci = "refuse-input", "fail"
    elif not coverage_complete or not units["unitComparable"]:
        wrapper = "partial"
        kind, ci = "resolve-partial-capture", "fail"
    else:
        wrapper = kit_status or "partial"
        kind, ci = ("review-list-price-fields", "pass") if wrapper == "actionable" else ("no-budget-delta" if wrapper == "informational" else "resolve-partial-capture", "pass" if wrapper in {"actionable", "informational"} else "fail")

    view = {
        "wrapperStatus": wrapper,
        "kitStatus": kit_status,
        "truth": {
            "schemaOk": schema_ok,
            "unitComparable": units["unitComparable"],
            "coverageComplete": coverage_complete,
            "membership": mem,
        },
        "kitCounts": {k: (artifact.get("underlying") or {}).get("counts", {}).get(k) for k in ("added", "removed", "fieldChanges", "unitChanges", "conflicting", "unknown")},
        "independentArithmetic": arith,
        "invoiceClaim": False,
        "forecast": False,
        "purchaseAuthority": False,
        "machineActionKind": kind,
        "ci": ci,
        "updateBaseline": False,
    }
    matched = None
    if baseline_path and baseline_path.exists():
        expected = json.loads(baseline_path.read_text())
        cmp_keys = ("wrapperStatus", "kitStatus", "truth", "kitCounts", "independentArithmetic", "invoiceClaim", "forecast", "purchaseAuthority", "machineActionKind", "ci", "updateBaseline")
        exp_view = {k: expected[k] for k in cmp_keys if k in expected}
        matched = json.dumps(view, sort_keys=True, default=str) == json.dumps(exp_view, sort_keys=True, default=str)
        if matched is False:
            kind, ci = "hold-baseline", "fail"
            view["machineActionKind"] = kind
            view["ci"] = ci

    out_dir.mkdir(parents=True, exist_ok=True)
    action = {
        "schema": "samedaydesk.hg04.vendor-change-ci.action.v1",
        "kind": kind,
        "ci": ci,
        "updateBaseline": False,
        "purchaseAuthority": False,
        "invoiceClaim": False,
        "forecast": False,
        "wrapperStatus": wrapper,
        "kitStatus": kit_status,
        "baselineMatched": matched,
        "baselineUpdated": False,
    }
    (out_dir / "machine-action.json").write_text(json.dumps(action, indent=2) + "\n")
    result = {
        "schema": "samedaydesk.hg04.vendor-change-ci.result.v1",
        "ok": ci == "pass",
        "wrapperStatus": wrapper,
        "kitStatus": kit_status,
        "machineAction": action,
        "truth": view["truth"],
        "independentArithmetic": arith,
        "invoiceClaim": False,
        "forecast": False,
        "purchaseAuthority": False,
        "baseline": {"compared": matched is not None, "matched": matched, "updated": False, "path": str(baseline_path) if baseline_path else None},
        "kitExit": proc.returncode,
    }
    (out_dir / "vendor-change-ci.json").write_text(json.dumps(result, indent=2) + "\n")
    (out_dir / "vendor-change-ci.md").write_text(
        "\n".join(
            [
                "# Vendor change CI (no purchase authority)",
                "",
                f"Wrapper status: **{wrapper}**",
                f"Machine action: **{kind}** (ci={ci}, updateBaseline=false)",
                "",
                f"Coverage complete: {coverage_complete}",
                f"invoiceClaim: false",
                f"forecast: false",
                "",
                "No measured usage. List-price field deltas are not a bill, invoice, or forecast.",
                "",
            ]
        )
        + "\n"
    )
    sys.stdout.write(json.dumps({"ok": ci == "pass", "wrapperStatus": wrapper, "kitStatus": kit_status, "machineAction": kind, "ci": ci, "updateBaseline": False, "invoiceClaim": False, "outDir": str(out_dir)}) + "\n")
    if extract_root and str(extract_root).find("hg04-uj-py-") >= 0:
        shutil.rmtree(extract_root, ignore_errors=True)
    return 0 if ci == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
