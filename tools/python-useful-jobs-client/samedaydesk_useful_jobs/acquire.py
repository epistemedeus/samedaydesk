"""Verify sha256+bytes, then extract. No extract on mismatch. No job rewrite."""

from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import stat
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .pins import (
    HASH_TERMS,
    HashTerms,
    assert_kit_matches_terms,
    default_archive_path,
    find_repo_root,
    load_repo_kit,
)
from .refuse import ClientRefuse

Fetcher = Callable[[str], tuple[int, bytes]]


@dataclass(frozen=True)
class AcquiredKit:
    kit_root: Path
    work_dir: Path
    sha256: str
    bytes: int
    source: str
    origin: str | None
    archive_path: str | None

    def close(self) -> None:
        shutil.rmtree(self.work_dir)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def sha256_hex(buf: bytes) -> str:
    return hashlib.sha256(buf).hexdigest()


def verify_archive_bytes(buf: bytes, terms: HashTerms = HASH_TERMS) -> str:
    size = len(buf)
    if size != terms.bytes:
        raise ClientRefuse(
            "wrong-size",
            f"size {size} != expected {terms.bytes}",
            size=size,
            expectedBytes=terms.bytes,
            extracted=False,
            executed=False,
        )
    digest = sha256_hex(buf)
    if digest != terms.sha256:
        raise ClientRefuse(
            "wrong-digest",
            f"sha256 {digest} != expected {terms.sha256}",
            sha256=digest,
            expectedSha=terms.sha256,
            extracted=False,
            executed=False,
        )
    return digest


def default_fetch(url: str, timeout: float = 30.0) -> tuple[int, bytes]:
    request = Request(url, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - caller supplies origin
            status = int(getattr(response, "status", 200) or 200)
            body = response.read(HASH_TERMS.bytes + 1)
            return status, body
    except HTTPError as err:
        return int(err.code), b""
    except (URLError, OSError, ValueError) as err:
        raise ClientRefuse(
            "fetch-failed",
            f"origin fetch failed: {getattr(err, 'reason', err)}",
            extracted=False,
            executed=False,
        ) from err


def _refuse_unsafe_member(member: tarfile.TarInfo, dest: Path, dest_resolved: Path) -> None:
    name = member.name or ""
    if member.issym() or member.islnk():
        raise ClientRefuse(
            "extract-unsafe-member",
            f"archive member is a link: {member.name}",
            extracted=False,
            executed=False,
        )
    if not (member.isfile() or member.isdir()) or member.sparse is not None or member.size < 0 or (member.isdir() and member.size):
        raise ClientRefuse(
            "extract-unsafe-member",
            f"archive member is a special file: {member.name}",
            extracted=False,
            executed=False,
        )
    if not name or Path(name).is_absolute() or name.startswith("/") or name.startswith("\\"):
        raise ClientRefuse(
            "extract-unsafe-path",
            f"archive member escapes extract dir: {member.name}",
            extracted=False,
            executed=False,
        )
    parts = name.removesuffix("/").split("/") if member.isdir() else name.split("/")
    if "\\" in name or "\x00" in name or any(part in {"", ".", ".."} for part in parts):
        raise ClientRefuse(
            "extract-unsafe-path",
            f"archive member escapes extract dir: {member.name}",
            extracted=False,
            executed=False,
        )
    target = (dest / name).resolve()
    if dest_resolved != target and dest_resolved not in target.parents:
        raise ClientRefuse(
            "extract-unsafe-path",
            f"archive member escapes extract dir: {member.name}",
            extracted=False,
            executed=False,
        )


def _safe_extract(buf: bytes, dest: Path, terms: HashTerms | None = None) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if any(dest.iterdir()):
        raise ClientRefuse("extract-occupied", "extraction requires an empty private directory")
    try:
        with tarfile.open(fileobj=io.BytesIO(buf), mode="r:gz") as tar:
            dest_resolved = dest.resolve()
            seen, total = set(), 0
            for count, member in enumerate(tar, 1):
                if count > 5000:
                    raise ClientRefuse("extract-limit", "archive exceeds 5000 members")
                _refuse_unsafe_member(member, dest, dest_resolved)
                name = member.name.rstrip("/")
                if terms and name.split("/")[0] != terms.root_name:
                    raise ClientRefuse("extract-root-mismatch", "archive root differs from pinned root")
                if name in seen:
                    raise ClientRefuse("extract-duplicate", "archive repeats a member path")
                seen.add(name)
                total += member.size
                if total > 64 * 1024 * 1024:
                    raise ClientRefuse("extract-limit", "archive expands beyond 64 MiB")
                member.mode = 0o700 if member.isdir() else 0o600
            try:
                tar.extractall(path=dest, filter="data")
            except TypeError as err:
                raise ClientRefuse(
                    "extract-filter-required",
                    "this client refuses unfiltered tar extract; Python tarfile data filter is required",
                    extracted=False,
                    executed=False,
                ) from err
    except ClientRefuse:
        raise
    except (tarfile.TarError, OSError, EOFError) as err:
        raise ClientRefuse("extract-failed", f"tar extract failed: {err}", extracted=False) from err


def _bind_catalog(kit_root: Path, terms: HashTerms) -> None:
    catalog_path = kit_root / "catalog.json"
    if not catalog_path.is_file():
        raise ClientRefuse(
            "missing-catalog",
            "extracted kit is missing catalog.json",
            kitRoot=str(kit_root),
            extracted=True,
            executed=False,
        )
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        ids = tuple(job["id"] for job in catalog["jobs"])
        outputs = {job["id"]: tuple(job["outputs"]) for job in catalog["jobs"]}
    except (ValueError, KeyError, TypeError) as err:
        raise ClientRefuse("catalog-mismatch", "invalid archive catalog") from err
    if outputs != terms.job_outputs or catalog.get("version") != terms.version or catalog.get("package") != terms.package:
        raise ClientRefuse("catalog-mismatch", "catalog identity or outputs differ from packaged pins")
    if ids != terms.jobs:
        raise ClientRefuse(
            "catalog-mismatch",
            "extracted catalog job ids differ from published hash terms",
            extractedIds=list(ids),
            expectedIds=list(terms.jobs),
            extracted=True,
            executed=False,
        )
    runtime = catalog.get("runtime") or {}
    if runtime.get("purchaseAuthority") is True:
        raise ClientRefuse(
            "catalog-purchase-authority",
            "extracted catalog claims purchaseAuthority; this client refuses that",
            extracted=True,
            executed=False,
        )


def acquire(
    *,
    archive: str | os.PathLike[str] | None = None,
    origin: str | None = None,
    fetcher: Fetcher | None = None,
    terms: HashTerms = HASH_TERMS,
    keep_work: bool = True,
) -> AcquiredKit:
    """Verify then extract. Default source is the committed in-repo tarball."""
    if archive and origin:
        raise ClientRefuse(
            "conflicting-source",
            "pass --archive for the committed file or --origin to fetch, not both",
        )

    repo_root = find_repo_root()
    if repo_root is not None and not archive and not origin:
        assert_kit_matches_terms(load_repo_kit(repo_root), terms)

    origin_used = None
    archive_path = None
    source = "committed-file"

    if origin:
        source = "origin-http"
        origin_used = origin.rstrip("/")
        url = origin_used + terms.archive_public_path
        fetch = fetcher or default_fetch
        status, buf = fetch(url)
        if status != 200:
            raise ClientRefuse(
                "bad-status",
                f"HTTP status {status} is not 200",
                status=status,
                extracted=False,
                executed=False,
            )
    else:
        if archive:
            path = Path(archive).expanduser().resolve()
        elif repo_root is not None:
            path = default_archive_path(repo_root, terms)
        else:
            raise ClientRefuse(
                "missing-archive",
                "no --archive and SameDayDesk repo kit JSON not found",
                extracted=False,
                executed=False,
            )
        if not path.is_file():
            raise ClientRefuse(
                "missing-archive",
                f"archive not found: {path}",
                archive=str(path),
                extracted=False,
                executed=False,
            )
        archive_path = str(path)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            with os.fdopen(fd, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise ClientRefuse("missing-archive", "archive must be a regular file")
                buf = stream.read(terms.bytes + 1)
        except OSError as err:
            raise ClientRefuse("archive-read-failed", str(err)) from err

    digest = verify_archive_bytes(buf, terms)

    work = Path(tempfile.mkdtemp(prefix="useful-jobs.", dir=os.environ.get("TMPDIR") or None))
    try:
        _safe_extract(buf, work, terms)
        kit_root = work / terms.root_name
        cli = kit_root / terms.cli
        if not cli.is_file():
            raise ClientRefuse(
                "missing-cli",
                f"extracted kit missing {terms.cli}",
                kitRoot=str(kit_root),
                extracted=True,
                executed=False,
            )
        _bind_catalog(kit_root, terms)
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise

    if not keep_work:
        shutil.rmtree(work, ignore_errors=True)

    return AcquiredKit(
        kit_root=kit_root,
        work_dir=work,
        sha256=digest,
        bytes=len(buf),
        source=source,
        origin=origin_used,
        archive_path=archive_path,
    )


def acquired_payload(kit: AcquiredKit) -> dict:
    catalog = json.loads((kit.kit_root / "catalog.json").read_text(encoding="utf-8"))
    ids = [job["id"] for job in catalog.get("jobs") or [] if isinstance(job, dict) and job.get("id")]
    return {
        "ok": True,
        "command": "acquire",
        "kitRoot": str(kit.kit_root),
        "sha256": kit.sha256,
        "bytes": kit.bytes,
        "source": kit.source,
        "origin": kit.origin,
        "archive": kit.archive_path,
        "jobs": ids,
        "sold": False,
        "purchaseAuthority": False,
        "extracted": True,
        "executed": False,
        "kind": "local-runtime",
        "acceptanceClass": "local-runtime",
    }


def catalog_payload(kit: AcquiredKit) -> dict:
    catalog = json.loads((kit.kit_root / "catalog.json").read_text(encoding="utf-8"))
    jobs = [job for job in catalog.get("jobs") or [] if isinstance(job, dict) and job.get("id")]
    ids = [job["id"] for job in jobs]
    outputs = {job["id"]: list(job.get("outputs") or []) for job in jobs}
    return {
        "ok": True,
        "command": "catalog",
        "jobs": ids,
        "outputs": outputs,
        "hashTerms": {
            "sha256": HASH_TERMS.sha256,
            "bytes": HASH_TERMS.bytes,
            "package": HASH_TERMS.package,
            "version": HASH_TERMS.version,
            "cli": HASH_TERMS.cli,
        },
        "kitRoot": str(kit.kit_root),
        "source": kit.source,
        "sha256": kit.sha256,
        "bytes": kit.bytes,
        "sold": False,
        "purchaseAuthority": False,
        "extracted": True,
        "executed": False,
        "kind": "local-runtime",
        "acceptanceClass": "local-runtime",
    }
