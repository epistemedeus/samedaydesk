"""Thin Python/stdin bridge to the exact released useful-jobs 1.4.0 Node CLI.

The bridge owns transport mechanics only: pin verification, safe extraction,
bounded stdin materialization, child lifecycle, and exact output publication.
Every job's semantics remain in the released Node archive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from .linux import SUPERVISOR, publication

ARCHIVE_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f"
ARCHIVE_BYTES = 2_575_215
ARCHIVE_ROOT = "useful-jobs-1.4.0"
PACKAGE_VERSION = "1.4.0"
REQUEST_SCHEMA = "samedaydesk.cw06.stdin-request.v1"
RESULT_SCHEMA = "samedaydesk.cw06.result-manifest.v1"
MANIFEST_NAME = "result-manifest.json"

MAX_STDIN_BYTES = 2 * 1024 * 1024
MAX_CALLER_BYTES = 1024 * 1024
MAX_CALLER_FILE_BYTES = 512 * 1024
MAX_ARCHIVE_MEMBERS = 5_000
MAX_EXTRACTED_BYTES = 64 * 1024 * 1024
MAX_CAPTURE_BYTES = 1024 * 1024
MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
MAX_OUTPUT_BYTES = 16 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 30.0


class ConsumerRefusal(Exception):
    """Closed, machine-readable refusal; never a payment failure."""

    def __init__(self, code: str, message: str, *, executed: bool = False, **detail: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.executed = executed
        self.detail = detail

    def payload(self) -> dict[str, Any]:
        return {
            "ok": False,
            "refused": True,
            "code": self.code,
            "error": self.message,
            "executed": self.executed,
            "published": False,
            "purchaseAuthority": False,
            "detail": self.detail,
        }


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    stdout: str
    stderr: str


def _sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _verify_archive(archive: Path) -> None:
    try:
        size = archive.stat().st_size
    except FileNotFoundError as exc:
        raise ConsumerRefusal("missing-archive", f"archive not found: {archive}") from exc
    if not archive.is_file():
        raise ConsumerRefusal("missing-archive", f"archive is not a regular file: {archive}")
    if size != ARCHIVE_BYTES:
        raise ConsumerRefusal(
            "archive-size-mismatch",
            f"archive has {size} bytes; expected {ARCHIVE_BYTES}",
            actualBytes=size,
            expectedBytes=ARCHIVE_BYTES,
        )
    with archive.open("rb") as handle:
        data = handle.read(ARCHIVE_BYTES + 1)
    if len(data) != ARCHIVE_BYTES:
        raise ConsumerRefusal("archive-size-mismatch", "archive changed size while reading")
    digest = hashlib.sha256(data).hexdigest()
    if digest != ARCHIVE_SHA256:
        raise ConsumerRefusal(
            "archive-digest-mismatch",
            "archive sha256 does not match useful-jobs 1.4.0",
            actualSha256=digest,
            expectedSha256=ARCHIVE_SHA256,
        )


def _snapshot_archive(archive: Path, snapshot: Path) -> None:
    # Extract only this private copy, never reopen a caller path after hashing.
    try:
        fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as source:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise ConsumerRefusal("missing-archive", "archive must be a regular file")
            data = source.read(ARCHIVE_BYTES + 1)
        if len(data) != ARCHIVE_BYTES:
            raise ConsumerRefusal("archive-size-mismatch", "archive has an unexpected byte length")
        snapshot.write_bytes(data)
        _verify_archive(snapshot)
    except OSError as exc:
        raise ConsumerRefusal("archive-read-failed", f"cannot read archive: {exc}") from exc


def _member_target(destination: Path, member: tarfile.TarInfo) -> Path:
    name = member.name
    # Validate raw components before any path library normalizes dot/slash forms.
    parts = name.removesuffix("/").split("/") if member.isdir() else name.split("/")
    if not name or "\x00" in name or "\\" in name or any(p in {"", ".", ".."} for p in parts):
        raise ConsumerRefusal("unsafe-archive-path", f"unsafe archive member: {name!r}")
    if parts[0] != ARCHIVE_ROOT:
        raise ConsumerRefusal("archive-root-mismatch", f"unexpected archive root: {name!r}")
    if member.issym() or member.islnk() or member.isdev() or member.isfifo():
        raise ConsumerRefusal("unsafe-archive-member", f"links and special files are refused: {name!r}")
    if not (member.isdir() or member.isfile()):
        raise ConsumerRefusal("unsafe-archive-member", f"unsupported archive member: {name!r}")
    if member.size < 0 or (member.isdir() and member.size != 0) or member.sparse is not None:
        raise ConsumerRefusal("unsafe-archive-member", f"invalid size or sparse member: {name!r}")
    target = destination.joinpath(*parts)
    resolved_destination = destination.resolve()
    resolved_target = target.resolve(strict=False)
    if resolved_target != resolved_destination and resolved_destination not in resolved_target.parents:
        raise ConsumerRefusal("unsafe-archive-path", f"archive member escapes destination: {name!r}")
    return target


def _copy_exact(source: BinaryIO, target: BinaryIO, expected: int) -> None:
    remaining = expected
    while remaining:
        block = source.read(min(1024 * 1024, remaining))
        if not block:
            raise ConsumerRefusal("truncated-archive-member", "archive member ended before its declared size")
        target.write(block)
        remaining -= len(block)
    if source.read(1):
        raise ConsumerRefusal("oversized-archive-member", "archive member exceeded its declared size")


def _extract_verified_archive(archive: Path, destination: Path) -> Path:
    try:
        destination.mkdir(mode=0o700, parents=True, exist_ok=False)
        with tarfile.open(archive, "r:gz") as bundle:
            total = 0
            seen = set()
            for count, member in enumerate(bundle, 1):
                if count > MAX_ARCHIVE_MEMBERS:
                    raise ConsumerRefusal("archive-member-limit", "archive contains too many members")
                target = _member_target(destination, member)
                if target in seen:
                    raise ConsumerRefusal("duplicate-archive-member", "archive repeats a member path")
                seen.add(target)
                total += member.size
                if total > MAX_EXTRACTED_BYTES:
                    raise ConsumerRefusal("archive-byte-limit", "archive expands beyond the accepted byte limit")
                if member.isdir():
                    target.mkdir(mode=0o700, parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                source = bundle.extractfile(member)
                if source is None:
                    raise ConsumerRefusal("missing-archive-member", f"cannot read archive member: {member.name}")
                with source, target.open("xb") as output:
                    os.fchmod(output.fileno(), 0o600)
                    _copy_exact(source, output, member.size)
    except ConsumerRefusal:
        raise
    except (tarfile.TarError, OSError, EOFError) as exc:
        raise ConsumerRefusal("archive-extract-failed", f"cannot extract archive: {exc}") from exc
    root = destination / ARCHIVE_ROOT
    if not (root / "bin" / "useful-jobs.mjs").is_file():
        raise ConsumerRefusal("missing-released-cli", "archive has no bin/useful-jobs.mjs")
    return root


def _load_catalog(root: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    try:
        catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConsumerRefusal("invalid-catalog", f"cannot read released catalog: {exc}") from exc
    jobs = catalog.get("jobs")
    if not isinstance(jobs, list) or len(jobs) != 10:
        raise ConsumerRefusal("catalog-job-count", "released catalog does not contain exactly ten jobs")
    by_id = {job.get("id"): job for job in jobs if isinstance(job, dict) and isinstance(job.get("id"), str)}
    if len(by_id) != 10:
        raise ConsumerRefusal("invalid-catalog", "released catalog contains invalid or duplicate job ids")
    runtime = catalog.get("runtime") or {}
    if runtime.get("purchaseAuthority") is True:
        raise ConsumerRefusal("catalog-authority", "consumer refuses a catalog claiming purchase authority")
    return catalog, by_id


def _strict_json(text: str) -> Any:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate JSON object key")
            result[key] = value
        return result

    def constant(value):
        raise ValueError("non-finite JSON number")

    def number(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError("non-finite JSON number")
        return result

    def check_strings(value):
        if isinstance(value, str):
            value.encode("utf-8")
        elif isinstance(value, dict):
            for key, child in value.items():
                check_strings(key)
                check_strings(child)
        elif isinstance(value, list):
            for child in value:
                check_strings(child)

    result = json.loads(text, object_pairs_hook=pairs, parse_constant=constant, parse_float=number)
    check_strings(result)
    return result


def _read_request(stream: BinaryIO) -> dict[str, Any]:
    raw = stream.read(MAX_STDIN_BYTES + 1)
    if len(raw) > MAX_STDIN_BYTES:
        raise ConsumerRefusal("stdin-byte-limit", f"stdin exceeds {MAX_STDIN_BYTES} bytes")
    try:
        request = _strict_json(raw.decode("utf-8"))
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ConsumerRefusal("invalid-stdin-json", f"stdin must be one UTF-8 JSON object: {exc}") from exc
    if not isinstance(request, dict):
        raise ConsumerRefusal("invalid-request", "stdin JSON must be an object")
    return request


def _validate_filename(filename: Any) -> str:
    if not isinstance(filename, str) or not filename or "\x00" in filename:
        raise ConsumerRefusal("invalid-filename", "each input filename must be a non-empty string")
    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise ConsumerRefusal("unsafe-input-path", f"input filename must be a basename: {filename!r}")
    if Path(filename).name != filename:
        raise ConsumerRefusal("unsafe-input-path", f"input filename must be a basename: {filename!r}")
    try:
        if len(filename.encode("utf-8")) > 255:
            raise ValueError("filename exceeds 255 UTF-8 bytes")
    except (UnicodeError, ValueError) as exc:
        raise ConsumerRefusal("invalid-filename", str(exc)) from exc
    return filename


def _validate_request(request: dict[str, Any], jobs: dict[str, dict[str, Any]]) -> tuple[str, dict[str, tuple[str, bytes]]]:
    if not isinstance(request, dict):
        raise ConsumerRefusal("invalid-request", "request must be an object")
    if request.get("schema") != REQUEST_SCHEMA:
        raise ConsumerRefusal("request-schema", f"schema must be {REQUEST_SCHEMA}")
    if request.get("example") is True:
        raise ConsumerRefusal("example-refused", "CW06 accepts caller bytes only; --example is not exposed")
    job_id = request.get("job")
    if not isinstance(job_id, str) or job_id not in jobs:
        raise ConsumerRefusal("unknown-job", f"job must name one of the ten released catalog entries")
    entries = request.get("inputs")
    if not isinstance(entries, dict):
        raise ConsumerRefusal("invalid-inputs", "inputs must be an object keyed by required flag name")
    if any(not isinstance(key, str) for key in entries):
        raise ConsumerRefusal("invalid-inputs", "input flag names must be strings")
    required = {
        flag.removeprefix("--")
        for flag in jobs[job_id].get("requiredInputs", [])
        if flag != "--out-dir"
    }
    actual = set(entries)
    if actual != required:
        raise ConsumerRefusal(
            "input-set-mismatch",
            "stdin inputs must exactly match the released job's caller inputs",
            expected=sorted(required),
            actual=sorted(actual),
        )
    normalized: dict[str, tuple[str, bytes]] = {}
    names: set[str] = set()
    total = 0
    for key in sorted(entries):
        item = entries[key]
        if not isinstance(item, dict):
            raise ConsumerRefusal("invalid-input", f"input {key!r} must contain filename and text")
        filename = _validate_filename(item.get("filename"))
        text = item.get("text")
        if not isinstance(text, str) or "\x00" in text:
            raise ConsumerRefusal("invalid-input", f"input {key!r} text must be a string without NUL")
        try:
            data = text.encode("utf-8")
        except UnicodeError as exc:
            raise ConsumerRefusal("invalid-input", "input text must encode as UTF-8") from exc
        if len(data) > MAX_CALLER_FILE_BYTES:
            raise ConsumerRefusal("caller-file-byte-limit", f"input {key!r} exceeds {MAX_CALLER_FILE_BYTES} bytes")
        total += len(data)
        if total > MAX_CALLER_BYTES:
            raise ConsumerRefusal("caller-byte-limit", f"caller inputs exceed {MAX_CALLER_BYTES} bytes")
        if filename in names:
            raise ConsumerRefusal("duplicate-filename", f"duplicate materialized filename: {filename!r}")
        names.add(filename)
        normalized[key] = (filename, data)
    return job_id, normalized


def _resolve_node(node: str | None) -> str:
    candidate = node or shutil.which("node")
    if not candidate:
        raise ConsumerRefusal("missing-node", "Node.js 22 or newer is required")
    resolved = Path(candidate).resolve()
    if not resolved.is_file():
        raise ConsumerRefusal("missing-node", f"Node.js binary not found: {candidate}")
    probe = _run_owned([str(resolved), "--version"], timeout=5.0)
    if probe.returncode != 0:
        raise ConsumerRefusal("node-version-failed", "cannot read Node.js version", detail=probe.stderr)
    try:
        major = int(probe.stdout.strip().lstrip("v").split(".", 1)[0])
    except (ValueError, IndexError) as exc:
        raise ConsumerRefusal("node-version-invalid", f"unexpected Node.js version: {probe.stdout!r}") from exc
    if major < 22:
        raise ConsumerRefusal("node-version-unsupported", f"Node.js {major} is older than required major 22")
    return str(resolved)


def _bounded_text(data: bytes, label: str) -> str:
    if len(data) > MAX_CAPTURE_BYTES:
        raise ConsumerRefusal("engine-output-limit", f"engine {label} exceeds {MAX_CAPTURE_BYTES} bytes", executed=True)
    try:
        return data.decode("utf-8")
    except UnicodeError as exc:
        raise ConsumerRefusal("invalid-engine-encoding", f"engine {label} is not UTF-8", executed=True) from exc


def _run_owned(command: list[str], *, timeout: float, cwd: Path | None = None) -> ProcessResult:
    if not math.isfinite(timeout) or timeout <= 0:
        raise ConsumerRefusal("invalid-timeout", "timeout must be finite and positive")
    with tempfile.TemporaryDirectory(prefix="cw06-engine-") as scratch:
        return _run_supervised(command, timeout=timeout, cwd=cwd, scratch=scratch)


def _run_supervised(command: list[str], *, timeout: float, cwd: Path | None, scratch: str) -> ProcessResult:
    env = {
        "PATH": os.environ.get("PATH", os.defpath),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
        "TMPDIR": scratch,
        # The released original-six wrappers unpack pinned nested archives with
        # GNU tar. User-namespace filesystems cannot chown their stored uid/gid;
        # this consumer-level option preserves bytes while suppressing chown.
        "TAR_OPTIONS": "--no-same-owner",
        "NODE_OPTIONS": "--max-old-space-size=768",
    }
    proc = subprocess.Popen(
        [sys.executable, "-c", SUPERVISOR, str(timeout), *command],
        cwd=str(cwd) if cwd else None,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        start_new_session=True,
    )
    captures = {"stdout": bytearray(), "stderr": bytearray()}
    try:
        with selectors.DefaultSelector() as selector:
            for label, stream in (("stdout", proc.stdout), ("stderr", proc.stderr)):
                selector.register(stream, selectors.EVENT_READ, label)
            while selector.get_map() or proc.poll() is None:
                for key, _ in selector.select(timeout=0.1):
                    block = os.read(key.fileobj.fileno(), 64 * 1024)
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    data = captures[key.data]
                    if len(data) + len(block) > MAX_CAPTURE_BYTES:
                        raise ConsumerRefusal("engine-output-limit", f"engine {key.data} exceeds {MAX_CAPTURE_BYTES} bytes", executed=True)
                    data.extend(block)
        proc.wait(timeout=2)
    finally:
        if proc.poll() is None:
            try:
                # Let the subreaper clean detached descendants before exiting.
                proc.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass
            proc.wait(timeout=5)
        proc.stdout.close()
        proc.stderr.close()
    if proc.returncode == 124:
        raise ConsumerRefusal("engine-timeout", "owned process tree timed out and was reaped", executed=True, timeoutSeconds=timeout)
    if proc.returncode == 125:
        raise ConsumerRefusal("supervision-unavailable", "Linux child subreaping is required")
    return ProcessResult(proc.returncode, _bounded_text(captures["stdout"], "stdout"), _bounded_text(captures["stderr"], "stderr"))


def _parse_engine_report(stdout: str) -> dict[str, Any]:
    try:
        report = _strict_json(stdout.strip())
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ConsumerRefusal("invalid-engine-report", "released CLI stdout is not one JSON object", executed=True) from exc
    if not isinstance(report, dict) or not isinstance(report.get("ok"), bool):
        raise ConsumerRefusal("invalid-engine-report", "released CLI report lacks boolean ok", executed=True)
    return report


def _validate_artifact_body(body: Any, job_id: str, report: dict[str, Any]) -> None:
    """Check released envelope identity/shape, without recomputing job semantics."""
    def require(condition):
        if not condition:
            raise ConsumerRefusal("invalid-artifact-content", "artifact does not match the released job/report contract", executed=True)

    require(isinstance(body, dict))
    require(body.get("ok") is not False and body.get("refused") is not True)
    require(body.get("purchaseAuthority") is not True and report.get("purchaseAuthority") is not True)
    if job_id == "route-table-diff":
        require(body.get("schema") == report.get("schema") == "samedaydesk.route-diff.v1")
        require(body.get("ok") is True and isinstance(body.get("counts"), dict))
        require(isinstance(body.get("outcome"), str) and body.get("outcome") == report.get("outcome") and body.get("outcome") in {"breaking", "changed", "title-only", "permutation", "no-change"})
        require(all(isinstance(body.get(key), list) for key in ("added", "removed", "changed", "collisions")))
        return
    if job_id == "page-change-offline-job":
        require(isinstance(body.get("report"), dict))
        require(body["report"].get("schema") == "pilot/page-change-brief/v1")
        require(body.get("report") == report.get("report"))
        return
    schema = {
        "lockfile-pin-delta": "samedaydesk.lockfile-pin-delta.v1",
        "json-schema-webhook-drift": "samedaydesk.json-schema-webhook-drift.v1",
    }.get(job_id, "s233.useful-application.artifact.v1")
    require(body.get("schema") == schema)
    require(body.get("appId") == report.get("appId") == job_id)
    require(isinstance(body.get("status"), str) and body.get("status") == report.get("status") and body.get("status") in {"actionable", "informational", "partial"})
    if job_id == "lockfile-pin-delta":
        require(body.get("ok") is True and isinstance(body.get("counts"), dict))
        require(all(isinstance(body.get(key), list) for key in ("added", "removed", "changed", "gaps")))
    elif job_id == "json-schema-webhook-drift":
        require(isinstance(body.get("impact"), dict))
        require(all(isinstance(body["impact"].get(key), list) for key in ("breaking", "compatible", "unknown", "deleted", "added")))
        require(body.get("termsVersion") == report.get("termsVersion") and isinstance(body.get("termsVersion"), str))
    else:
        require(isinstance(body.get("summary"), str) and bool(body["summary"].strip()))
        require(all(isinstance(body.get(key), list) for key in ("actions", "gaps")))
        require(body.get("noPurchaseAuthority") is True)
        require(body.get("digest") == report.get("digest") and isinstance(body.get("digest"), str))


def _validate_artifacts(stage: Path, expected: list[str], *, job_id: str | None = None, report: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not expected or any(not isinstance(name, str) or name in {".", "..", MANIFEST_NAME} or Path(name).name != name for name in expected) or len(set(expected)) != len(expected):
        raise ConsumerRefusal("invalid-artifact-contract", "released catalog has an invalid artifact set", executed=True)
    if stage.is_symlink() or not stage.is_dir():
        raise ConsumerRefusal("unsafe-artifact", "output stage must be a real directory", executed=True)
    found = sorted(path.name for path in stage.iterdir())
    if found != sorted(expected):
        raise ConsumerRefusal(
            "artifact-set-mismatch",
            "released CLI did not produce exactly the catalog artifact set",
            executed=True,
            expected=sorted(expected),
            found=found,
        )
    artifacts = []
    total = 0
    for name in expected:
        path = stage / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid():
            raise ConsumerRefusal("unsafe-artifact", f"artifact must be an owned regular file without links: {name}", executed=True)
        total += info.st_size
        if info.st_size <= 0 or info.st_size > MAX_ARTIFACT_BYTES or total > MAX_OUTPUT_BYTES:
            raise ConsumerRefusal("artifact-byte-limit", f"artifact is empty or exceeds output byte limits: {name}", executed=True)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            opened = os.fstat(stream.fileno())
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise ConsumerRefusal("unsafe-artifact", "artifact changed before validation", executed=True)
            data = stream.read(MAX_ARTIFACT_BYTES + 1)
        after = path.lstat()
        stable = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_nlink)
        if len(data) != info.st_size or stable(after) != stable(info):
            raise ConsumerRefusal("unsafe-artifact", "artifact changed during validation", executed=True)
        try:
            text = data.decode("utf-8")
            if not text.strip() or "\x00" in text:
                raise ValueError("empty text or NUL")
            if name.endswith(".json"):
                body = _strict_json(text)
                if not isinstance(body, dict):
                    raise ValueError("JSON artifact must be an object")
                if job_id is not None:
                    _validate_artifact_body(body, job_id, report or {})
            elif name.endswith(".md"):
                if not text.lstrip().startswith("# "):
                    raise ValueError("missing Markdown report heading")
            elif name.endswith(".ics"):
                lines = text.splitlines()
                if lines[0] != "BEGIN:VCALENDAR" or lines[-1] != "END:VCALENDAR" or "VERSION:2.0" not in lines:
                    raise ValueError("incomplete calendar envelope")
                components = []
                for line in lines:
                    if line.startswith("BEGIN:"):
                        components.append(line[6:])
                    elif line.startswith("END:"):
                        if not components or components.pop() != line[4:]:
                            raise ValueError("unbalanced calendar component")
                if components:
                    raise ValueError("incomplete calendar component")
        except (UnicodeError, ValueError, RecursionError) as exc:
            raise ConsumerRefusal("invalid-artifact-content", f"invalid artifact {name}: {exc}", executed=True) from exc
        artifacts.append({"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return artifacts


def consume(
    request: dict[str, Any],
    *,
    archive: Path,
    output_dir: Path,
    node: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    if sys.platform != "linux" or not Path("/proc/self/task").is_dir():
        raise ConsumerRefusal("unsupported-platform", "Linux with procfs is required for owned descendant cleanup and publication")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0 or timeout > 300:
        raise ConsumerRefusal("invalid-timeout", "timeout must be finite, greater than 0 and at most 300 seconds")
    output_dir = Path(os.path.abspath(output_dir))
    if os.path.lexists(output_dir):
        raise ConsumerRefusal("occupied-output", f"output path already exists: {output_dir}")
    executed = False
    try:
        with tempfile.TemporaryDirectory(prefix="cw06-useful-jobs-") as temp_name:
            temporary = Path(temp_name)
            snapshot = temporary / "release.tar.gz"
            _snapshot_archive(archive, snapshot)
            root = _extract_verified_archive(snapshot, temporary / "archive")
            _, jobs = _load_catalog(root)
            job_id, inputs = _validate_request(request, jobs)
            node_bin = _resolve_node(node)
            input_dir = temporary / "caller bytes"
            input_dir.mkdir(mode=0o700)
            argv = [node_bin, str(root / "bin" / "useful-jobs.mjs"), "run", job_id]
            for key in sorted(inputs):
                filename, data = inputs[key]
                path = input_dir / filename
                path.write_bytes(data)
                argv.extend([f"--{key}", str(path)])
            with publication(output_dir) as (stage, publish):
                argv.extend(["--out-dir", str(stage)])
                executed = True
                result = _run_owned(argv, timeout=timeout, cwd=root)
                report = _parse_engine_report(result.stdout)
                if result.returncode != 0 or report.get("ok") is not True or report.get("refused") is True or report.get("status") == "refused":
                    raise ConsumerRefusal(
                        "engine-failed",
                        "released useful-jobs CLI refused or failed the caller input",
                        executed=True,
                        returncode=result.returncode,
                        engineReport=report,
                        engineStderr=result.stderr,
                    )
                expected = list(jobs[job_id].get("outputs") or [])
                artifacts = _validate_artifacts(stage, expected, job_id=job_id, report=report)
                manifest = {
                    "schema": RESULT_SCHEMA,
                    "ok": True,
                    "job": job_id,
                    "release": {
                        "name": ARCHIVE_ROOT,
                        "version": PACKAGE_VERSION,
                        "archiveBytes": ARCHIVE_BYTES,
                        "archiveSha256": ARCHIVE_SHA256,
                    },
                    "callerInputBytes": sum(len(data) for _, data in inputs.values()),
                    "artifacts": artifacts,
                    "engine": {
                        "returncode": result.returncode,
                        "report": report,
                        "stderr": result.stderr,
                    },
                    "claims": {
                        "kind": "offline-local-runtime",
                        "paidHttpEndpoints": 0,
                        "purchaseAuthority": False,
                        "networkIsolation": False,
                        "semanticRecomputation": False,
                    },
                    "validation": {
                        "artifactSet": "exact",
                        "content": "released-envelope-and-format",
                        "publication": "linux-renameat2-noreplace",
                        "processOwnership": "dedicated-linux-subreaper",
                    },
                    "compatibility": {
                        "tarOptions": "--no-same-owner",
                        "reason": "nested release archives retain bytes but do not chown in a user-namespace filesystem",
                    },
                }
                (stage / MANIFEST_NAME).write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                publish()
                return {
                    "ok": True,
                    "job": job_id,
                    "outputDir": str(output_dir),
                    "manifest": str(output_dir / MANIFEST_NAME),
                    "artifacts": artifacts,
                    "domainStatus": report.get("status", report.get("outcome")),
                    "executed": True,
                    "published": True,
                    "purchaseAuthority": False,
                }
    except FileExistsError as exc:
        raise ConsumerRefusal("occupied-output", "output path became occupied; existing entry preserved", executed=executed) from exc
    except (OSError, subprocess.SubprocessError) as exc:
        raise ConsumerRefusal("runtime-io-failed", f"runtime I/O failed: {exc}", executed=executed) from exc


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path, help="exact useful-jobs-1.4.0.tar.gz")
    parser.add_argument("--output-dir", required=True, type=Path, help="new caller-owned result directory")
    parser.add_argument("--node", help="Node.js 22+ executable (default: PATH)")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    return parser


def main() -> None:
    args = _parser().parse_args()
    try:
        request = _read_request(sys.stdin.buffer)
        payload = consume(
            request,
            archive=args.archive,
            output_dir=args.output_dir,
            node=args.node,
            timeout=args.timeout,
        )
    except ConsumerRefusal as exc:
        print(json.dumps(exc.payload(), ensure_ascii=False, sort_keys=True))
        raise SystemExit(2) from exc
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
