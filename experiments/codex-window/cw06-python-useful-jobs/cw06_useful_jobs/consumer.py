"""Thin Python/stdin bridge to the exact released useful-jobs 1.4.0 Node CLI.

The bridge owns transport mechanics only: pin verification, safe extraction,
bounded stdin materialization, child lifecycle, and exact output publication.
Every job's semantics remain in the released Node archive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

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
    digest = _sha256_path(archive)
    if digest != ARCHIVE_SHA256:
        raise ConsumerRefusal(
            "archive-digest-mismatch",
            "archive sha256 does not match useful-jobs 1.4.0",
            actualSha256=digest,
            expectedSha256=ARCHIVE_SHA256,
        )


def _member_target(destination: Path, member: tarfile.TarInfo) -> Path:
    name = member.name
    posix = PurePosixPath(name)
    if not name or posix.is_absolute() or ".." in posix.parts:
        raise ConsumerRefusal("unsafe-archive-path", f"unsafe archive member: {name!r}")
    if not posix.parts or posix.parts[0] != ARCHIVE_ROOT:
        raise ConsumerRefusal("archive-root-mismatch", f"unexpected archive root: {name!r}")
    if member.issym() or member.islnk() or member.isdev() or member.isfifo():
        raise ConsumerRefusal("unsafe-archive-member", f"links and special files are refused: {name!r}")
    if not (member.isdir() or member.isfile()):
        raise ConsumerRefusal("unsafe-archive-member", f"unsupported archive member: {name!r}")
    target = destination.joinpath(*posix.parts)
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
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            if len(members) > MAX_ARCHIVE_MEMBERS:
                raise ConsumerRefusal("archive-member-limit", "archive contains too many members")
            total = sum(member.size for member in members if member.isfile())
            if total > MAX_EXTRACTED_BYTES:
                raise ConsumerRefusal("archive-byte-limit", "archive expands beyond the accepted byte limit")
            targets = [(member, _member_target(destination, member)) for member in members]
            for member, target in targets:
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = bundle.extractfile(member)
                if source is None:
                    raise ConsumerRefusal("missing-archive-member", f"cannot read archive member: {member.name}")
                with source, target.open("xb") as output:
                    _copy_exact(source, output, member.size)
    except ConsumerRefusal:
        raise
    except (tarfile.TarError, OSError) as exc:
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


def _read_request(stream: BinaryIO) -> dict[str, Any]:
    raw = stream.read(MAX_STDIN_BYTES + 1)
    if len(raw) > MAX_STDIN_BYTES:
        raise ConsumerRefusal("stdin-byte-limit", f"stdin exceeds {MAX_STDIN_BYTES} bytes")
    try:
        request = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
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
    return filename


def _validate_request(request: dict[str, Any], jobs: dict[str, dict[str, Any]]) -> tuple[str, dict[str, tuple[str, bytes]]]:
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
        data = text.encode("utf-8")
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
    return data.decode("utf-8", errors="replace")


def _run_owned(command: list[str], *, timeout: float, cwd: Path | None = None) -> ProcessResult:
    env = {
        "PATH": os.environ.get("PATH", os.defpath),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
        "TMPDIR": os.environ.get("TMPDIR", tempfile.gettempdir()),
        # The released original-six wrappers unpack pinned nested archives with
        # GNU tar. User-namespace filesystems cannot chown their stored uid/gid;
        # this consumer-level option preserves bytes while suppressing chown.
        "TAR_OPTIONS": "--no-same-owner",
    }
    proc = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        start_new_session=True,
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = proc.communicate()
        raise ConsumerRefusal(
            "engine-timeout",
            f"owned process group exceeded {timeout:g} seconds and was killed",
            executed=True,
            timeoutSeconds=timeout,
            stdout=_bounded_text(stdout, "stdout"),
            stderr=_bounded_text(stderr, "stderr"),
        ) from exc
    finally:
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
    return ProcessResult(proc.returncode, _bounded_text(stdout, "stdout"), _bounded_text(stderr, "stderr"))


def _parse_engine_report(stdout: str) -> dict[str, Any]:
    try:
        report = json.loads(stdout.strip())
    except json.JSONDecodeError as exc:
        raise ConsumerRefusal("invalid-engine-report", "released CLI stdout is not one JSON object", executed=True) from exc
    if not isinstance(report, dict) or not isinstance(report.get("ok"), bool):
        raise ConsumerRefusal("invalid-engine-report", "released CLI report lacks boolean ok", executed=True)
    return report


def _validate_artifacts(stage: Path, expected: list[str]) -> list[dict[str, Any]]:
    if not expected or any(not isinstance(name, str) or Path(name).name != name for name in expected):
        raise ConsumerRefusal("invalid-artifact-contract", "released catalog has an invalid artifact set", executed=True)
    found_paths = sorted(path for path in stage.rglob("*") if path.is_file() or path.is_symlink())
    found = [path.relative_to(stage).as_posix() for path in found_paths]
    if found != sorted(expected):
        raise ConsumerRefusal(
            "artifact-set-mismatch",
            "released CLI did not produce exactly the catalog artifact set",
            executed=True,
            expected=sorted(expected),
            found=found,
        )
    artifacts = []
    for name in expected:
        path = stage / name
        if path.is_symlink() or not path.is_file():
            raise ConsumerRefusal("unsafe-artifact", f"artifact is not a regular file: {name}", executed=True)
        artifacts.append({"name": name, "bytes": path.stat().st_size, "sha256": _sha256_path(path)})
    return artifacts


def consume(
    request: dict[str, Any],
    *,
    archive: Path,
    output_dir: Path,
    node: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    if timeout <= 0 or timeout > 300:
        raise ConsumerRefusal("invalid-timeout", "timeout must be greater than 0 and at most 300 seconds")
    output_dir = output_dir.resolve(strict=False)
    if output_dir.exists():
        raise ConsumerRefusal("occupied-output", f"output path already exists: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    _verify_archive(archive.resolve())
    node_bin = _resolve_node(node)

    with tempfile.TemporaryDirectory(prefix="cw06-useful-jobs-") as temp_name:
        temporary = Path(temp_name)
        root = _extract_verified_archive(archive.resolve(), temporary / "archive")
        _, jobs = _load_catalog(root)
        job_id, inputs = _validate_request(request, jobs)
        input_dir = temporary / "caller bytes"
        input_dir.mkdir()
        argv = [node_bin, str(root / "bin" / "useful-jobs.mjs"), "run", job_id]
        for key in sorted(inputs):
            filename, data = inputs[key]
            path = input_dir / filename
            path.write_bytes(data)
            argv.extend([f"--{key}", str(path)])
        stage = temporary / "publish"
        argv.extend(["--out-dir", str(stage)])
        result = _run_owned(argv, timeout=timeout, cwd=root)
        report = _parse_engine_report(result.stdout)
        if result.returncode != 0 or report.get("ok") is not True:
            raise ConsumerRefusal(
                "engine-failed",
                "released useful-jobs CLI refused or failed the caller input",
                executed=True,
                returncode=result.returncode,
                engineReport=report,
                engineStderr=result.stderr,
            )
        expected = list(jobs[job_id].get("outputs") or [])
        artifacts = _validate_artifacts(stage, expected)
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
        if output_dir.exists():
            raise ConsumerRefusal("occupied-output", f"output path became occupied: {output_dir}", executed=True)
        stage.rename(output_dir)
        return {
            "ok": True,
            "job": job_id,
            "outputDir": str(output_dir),
            "manifest": str(output_dir / MANIFEST_NAME),
            "artifacts": artifacts,
            "domainStatus": report.get("status"),
            "executed": True,
            "published": True,
            "purchaseAuthority": False,
        }


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
