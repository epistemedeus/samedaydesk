#!/usr/bin/env python3
"""Independent runtime: subprocess the SDS PR52 paid wrapper CLI.

Does not reimplement engines. Does not import the W4-commerce-14 client.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path


INPUT_FLAGS = ("before", "after", "used", "input", "next-run", "input-root")


def emit(payload: dict, code: int) -> int:
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    return code


def transport_fail(code: str, message: str, extra: dict | None = None) -> dict:
    body = {
        "ok": False,
        "refused": True,
        "transportFailure": True,
        "code": code,
        "error": message,
        "sold": False,
        "sample": False,
        "purchaseAuthority": False,
        "runtime": "python3",
    }
    if extra:
        body.update(extra)
    return body


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="d27-trial-runtime")
    p.add_argument("--cli", required=True)
    p.add_argument("--repo", required=True)
    p.add_argument("--job", required=True)
    p.add_argument("--out-dir")
    p.add_argument("--node-bin", default="node")
    p.add_argument("--funding")
    p.add_argument("--payment")
    p.add_argument("--example", action="store_true")
    p.add_argument("--meta-path")
    for flag in INPUT_FLAGS:
        p.add_argument(f"--{flag}")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    started = time.time()
    node_bin = args.node_bin
    if not shutil.which(node_bin) and not Path(node_bin).is_file():
        return emit(transport_fail("missing-node", f"node binary not found: {node_bin}"), 2)

    cli = Path(args.cli)
    if not cli.is_file():
        return emit(transport_fail("missing-wrapper-cli", f"wrapper CLI not found: {cli}"), 2)

    cmd = [node_bin, str(cli), "run", args.job]
    if args.example:
        cmd.append("--example")
    for flag in INPUT_FLAGS:
        value = getattr(args, flag.replace("-", "_"))
        if value:
            cmd.extend([f"--{flag}", value])
    if args.funding:
        cmd.extend(["--funding", args.funding])
    if args.payment:
        cmd.extend(["--payment", args.payment])
    if args.out_dir:
        cmd.extend(["--out-dir", args.out_dir])

    try:
        result = subprocess.run(
            cmd,
            cwd=args.repo,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired as err:
        return emit(transport_fail("engine-timeout", str(err)), 2)
    except OSError as err:
        return emit(transport_fail("spawn-failed", str(err)), 2)

    meta = {
        "runtime": "python3",
        "pythonVersion": sys.version.split()[0],
        "nodeBin": node_bin,
        "cli": str(cli),
        "argv": cmd,
        "durationMs": int((time.time() - started) * 1000),
        "wrapperExit": result.returncode,
        "stderr": (result.stderr or "")[-4000:],
    }
    meta_path = args.meta_path
    if not meta_path and args.out_dir:
        meta_path = str(Path(args.out_dir) / "independent-runtime.json")
    if meta_path:
        Path(meta_path).parent.mkdir(parents=True, exist_ok=True)
        Path(meta_path).write_text(json.dumps(meta, indent=2) + "\n")

    stdout = (result.stdout or "").strip()
    if not stdout:
        return emit(
            transport_fail(
                "empty-wrapper-stdout",
                "wrapper produced no JSON",
                {"stderr": meta["stderr"], "wrapperExit": result.returncode},
            ),
            2,
        )
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        start = stdout.find("{")
        end = stdout.rfind("}")
        if start < 0 or end <= start:
            return emit(
                transport_fail(
                    "non-json-wrapper-stdout",
                    "wrapper stdout was not JSON",
                    {"stdoutHead": stdout[:500], "wrapperExit": result.returncode},
                ),
                2,
            )
        try:
            payload = json.loads(stdout[start : end + 1])
        except json.JSONDecodeError as err:
            return emit(transport_fail("non-json-wrapper-stdout", str(err)), 2)

    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    return 0 if payload.get("ok") is True else 2


if __name__ == "__main__":
    raise SystemExit(main())
