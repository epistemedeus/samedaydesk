"""Spawn the extracted Node CLI. Do not rewrite job engines."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .acquire import AcquiredKit, acquire
from .honesty import inspect_argv, refuse_sale_intent, sample_envelope
from .pins import HASH_TERMS, JOB_IDS
from .refuse import ClientRefuse


def resolve_node_bin(explicit: str | None = None) -> str:
    candidate = explicit or os.environ.get("USEFUL_JOBS_NODE") or shutil.which("node")
    if not candidate:
        raise ClientRefuse(
            "missing-node",
            "Node.js binary not found on PATH. The extracted useful-jobs CLI needs Node >= 22. "
            "This is a missing runtime binary, not a payment error.",
            missing="node",
            label="missing-node-binary",
            extracted=True,
            executed=False,
        )
    path = Path(candidate)
    if not path.is_file() and shutil.which(candidate) is None:
        raise ClientRefuse(
            "missing-node",
            f"Node.js binary not found: {candidate}. Need Node >= 22. Not a payment error.",
            missing="node",
            label="missing-node-binary",
            node=str(candidate),
            extracted=True,
            executed=False,
        )
    return str(path if path.is_file() else shutil.which(candidate))


def spawn_node(kit: AcquiredKit, args: list[str], *, node_bin: str | None = None) -> subprocess.CompletedProcess[str]:
    binary = resolve_node_bin(node_bin)
    cli = kit.kit_root / HASH_TERMS.cli
    command = [binary, str(cli), *args]
    try:
        return subprocess.run(
            command,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            env=os.environ.copy(),
        )
    except FileNotFoundError as err:
        raise ClientRefuse(
            "missing-node",
            "Node.js binary not found. The extracted useful-jobs CLI needs Node >= 22. "
            "This is a missing runtime binary, not a payment error.",
            missing="node",
            label="missing-node-binary",
            extracted=True,
            executed=False,
        ) from err


def _parse_engine_json(stdout: str) -> Any:
    text = (stdout or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None


def _outputs_exist(job_id: str, out_dir: str | None) -> list[str]:
    if not out_dir:
        return []
    root = Path(out_dir)
    found = []
    for name in HASH_TERMS.outputs_for(job_id):
        if (root / name).is_file():
            found.append(name)
    return found


def _bind_job(job_id: str) -> None:
    if job_id not in JOB_IDS:
        raise ClientRefuse(
            "unknown-job",
            f"unknown job {job_id}",
            job=job_id,
            jobs=list(JOB_IDS),
            executed=False,
        )


def list_jobs(
    *,
    archive: str | None = None,
    origin: str | None = None,
    kit: AcquiredKit | None = None,
) -> dict:
    kit = kit or acquire(archive=archive, origin=origin)
    result = spawn_node(kit, ["list", "--json"])
    engine = _parse_engine_json(result.stdout)
    ids = []
    if isinstance(engine, dict) and engine.get("ok") and isinstance(engine.get("jobs"), list):
        ids = [job.get("id") for job in engine["jobs"] if isinstance(job, dict)]
    if ids and tuple(ids) != HASH_TERMS.jobs:
        raise ClientRefuse(
            "catalog-mismatch",
            "node list job ids differ from published hash terms",
            listed=ids,
            expected=list(JOB_IDS),
            extracted=True,
            executed=True,
        )
    return {
        "ok": result.returncode == 0,
        "command": "list",
        "jobs": list(JOB_IDS),
        "engine": engine,
        "kitRoot": str(kit.kit_root),
        "source": kit.source,
        "sha256": kit.sha256,
        "bytes": kit.bytes,
        "sold": False,
        "purchaseAuthority": False,
        "extracted": True,
        "executed": True,
        "engineStatus": result.returncode,
        "engineStderr": result.stderr,
        "kind": "local-runtime",
    }


def help_job(
    job_id: str | None = None,
    *,
    archive: str | None = None,
    origin: str | None = None,
    kit: AcquiredKit | None = None,
) -> dict:
    if job_id:
        _bind_job(job_id)
    kit = kit or acquire(archive=archive, origin=origin)
    args = ["help"] + ([job_id] if job_id else [])
    result = spawn_node(kit, args)
    return {
        "ok": result.returncode == 0,
        "command": "help",
        "job": job_id,
        "jobs": list(JOB_IDS),
        "engineStdout": result.stdout,
        "engineStderr": result.stderr,
        "engineStatus": result.returncode,
        "kitRoot": str(kit.kit_root),
        "sold": False,
        "purchaseAuthority": False,
        "extracted": True,
        "executed": True,
        "kind": "local-runtime",
    }


def run_job(
    job_id: str,
    argv: list[str] | None = None,
    *,
    archive: str | None = None,
    origin: str | None = None,
    kit: AcquiredKit | None = None,
    node_bin: str | None = None,
) -> dict:
    _bind_job(job_id)
    example, sale_reasons, passthrough = inspect_argv(argv or [])
    refuse_sale_intent(example, sale_reasons)
    kit = kit or acquire(archive=archive, origin=origin)
    result = spawn_node(kit, ["run", job_id, *passthrough], node_bin=node_bin)
    engine = _parse_engine_json(result.stdout)
    envelope = sample_envelope(example)
    out_dir = None
    engine_ok = False
    if isinstance(engine, dict):
        engine_ok = engine.get("ok") is True
        out_dir = engine.get("outDir")
        if engine.get("sold") is True or engine.get("sale") is True:
            raise ClientRefuse(
                "sample-as-sale",
                "engine output claimed a sale. SAMPLE/caller useful-jobs runs are not sold.",
                label="SAMPLE" if example else "caller-input",
                sample=example,
                engine=engine,
            )
        if engine.get("purchaseAuthority") is True:
            raise ClientRefuse(
                "purchase-authority",
                "engine claimed purchaseAuthority; this client refuses that",
                engine=engine,
            )
    outputs = _outputs_exist(job_id, out_dir)
    expected = list(HASH_TERMS.outputs_for(job_id))
    payload = {
        "ok": result.returncode == 0 and engine_ok,
        "command": "run",
        "job": job_id,
        "outDir": out_dir,
        "outputs": expected,
        "outputsFound": outputs,
        "outputsExist": bool(expected) and outputs == expected,
        "engine": engine,
        "engineStatus": result.returncode,
        "engineStderr": result.stderr,
        "kitRoot": str(kit.kit_root),
        "source": kit.source,
        "sha256": kit.sha256,
        "bytes": kit.bytes,
        "extracted": True,
        "executed": True,
        "acceptanceClass": envelope["kind"],
        **envelope,
    }
    if result.returncode != 0:
        payload["ok"] = False
        payload["refused"] = True
        if isinstance(engine, dict) and engine.get("code"):
            payload["engineCode"] = engine.get("code")
    return payload
