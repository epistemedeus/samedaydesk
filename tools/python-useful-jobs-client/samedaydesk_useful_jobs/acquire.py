"""Verify sha256+bytes, then extract. No extract on mismatch. No job rewrite."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
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
            body = response.read()
            return status, body
    except HTTPError as err:
        return int(err.code), err.read() if err.fp else b""
    except URLError as err:
        raise ClientRefuse(
            "fetch-failed",
            f"origin fetch failed: {err.reason or err}",
            extracted=False,
            executed=False,
        ) from err


def _safe_extract(buf: bytes, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    tmp_tar = dest / "useful-jobs-1.0.0.tar.gz"
    tmp_tar.write_bytes(buf)
    try:
        with tarfile.open(tmp_tar, "r:gz") as tar:
            dest_resolved = dest.resolve()
            for member in tar.getmembers():
                target = (dest / member.name).resolve()
                if dest_resolved != target and dest_resolved not in target.parents:
                    raise ClientRefuse(
                        "extract-unsafe-path",
                        f"archive member escapes extract dir: {member.name}",
                        extracted=False,
                        executed=False,
                    )
            try:
                tar.extractall(path=dest, filter="data")
            except TypeError:
                tar.extractall(path=dest)
    except ClientRefuse:
        raise
    except tarfile.TarError as err:
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
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    ids = tuple(job["id"] for job in catalog.get("jobs") or [])
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
    if repo_root is not None:
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
        buf = path.read_bytes()

    digest = verify_archive_bytes(buf, terms)

    work = Path(tempfile.mkdtemp(prefix="useful-jobs.", dir=os.environ.get("TMPDIR") or None))
    try:
        _safe_extract(buf, work)
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
    return {
        "ok": True,
        "command": "acquire",
        "kitRoot": str(kit.kit_root),
        "sha256": kit.sha256,
        "bytes": kit.bytes,
        "source": kit.source,
        "origin": kit.origin,
        "archive": kit.archive_path,
        "jobs": list(HASH_TERMS.jobs),
        "sold": False,
        "purchaseAuthority": False,
        "extracted": True,
        "executed": False,
        "kind": "local-runtime",
        "acceptanceClass": "local-runtime",
    }
