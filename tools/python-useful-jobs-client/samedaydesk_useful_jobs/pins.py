"""Hash terms for the PR51 useful-jobs archive.

Authoritative fields are the current in-repo kit JSON when present.
Packaged pins.json is the same published sha256+bytes contract so a
standalone `--archive` path can still verify. Size and digest both
must match before extract (not a sha-only or size-only check).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .refuse import ClientRefuse

_HERE = Path(__file__).resolve().parent
_PINS_FILE = _HERE / "pins.json"


@dataclass(frozen=True)
class HashTerms:
    schema: str
    package: str
    version: str
    sha256: str
    bytes: int
    root_name: str
    cli: str
    archive_rel: str
    archive_public_path: str
    catalog_rel: str
    kit_json_rel: str
    node: str
    purchase_authority: bool
    source_repo: str
    source_commit: str
    archive_freeze: str
    reviewed_source: str
    jobs: tuple[str, ...]
    job_outputs: dict[str, tuple[str, ...]]

    def outputs_for(self, job_id: str) -> tuple[str, ...]:
        return self.job_outputs.get(job_id, ())


def _as_terms(raw: dict[str, Any]) -> HashTerms:
    outputs = {
        key: tuple(names)
        for key, names in (raw.get("jobOutputs") or {}).items()
    }
    return HashTerms(
        schema=str(raw["schema"]),
        package=str(raw["package"]),
        version=str(raw["version"]),
        sha256=str(raw["sha256"]).lower(),
        bytes=int(raw["bytes"]),
        root_name=str(raw["rootName"]),
        cli=str(raw["cli"]),
        archive_rel=str(raw["archiveRel"]),
        archive_public_path=str(raw["archivePublicPath"]),
        catalog_rel=str(raw["catalogRel"]),
        kit_json_rel=str(raw["kitJsonRel"]),
        node=str(raw["node"]),
        purchase_authority=bool(raw["purchaseAuthority"]),
        source_repo=str(raw["sourceRepo"]),
        source_commit=str(raw["sourceCommit"]),
        archive_freeze=str(raw["archiveFreeze"]),
        reviewed_source=str(raw["reviewedSource"]),
        jobs=tuple(raw["jobs"]),
        job_outputs=outputs,
    )


def load_packaged_pins() -> HashTerms:
    raw = json.loads(_PINS_FILE.read_text(encoding="utf-8"))
    terms = _as_terms(raw)
    if terms.bytes <= 0:
        raise ClientRefuse("invalid-expected-bytes", "expected bytes must be a positive integer")
    if len(terms.sha256) != 64 or any(c not in "0123456789abcdef" for c in terms.sha256):
        raise ClientRefuse(
            "invalid-expected-sha256",
            "expected sha256 must be 64 lowercase hex chars",
        )
    if terms.purchase_authority:
        raise ClientRefuse(
            "pin-purchase-authority",
            "hash terms must keep purchaseAuthority false for this free client",
        )
    return terms


def find_repo_root(start: Path | None = None) -> Path | None:
    env = os.environ.get("SAMEDAYDESK_ROOT")
    if env:
        candidate = Path(env).expanduser()
        if (candidate / "client/src/data/usefulJobsKit.json").is_file():
            return candidate.resolve()
    here = (start or Path(__file__)).resolve()
    for parent in [here, *here.parents]:
        if (parent / "client/src/data/usefulJobsKit.json").is_file():
            return parent
    return None


def load_repo_kit(repo_root: Path) -> dict[str, Any]:
    path = repo_root / "client/src/data/usefulJobsKit.json"
    return json.loads(path.read_text(encoding="utf-8"))


def assert_kit_matches_terms(kit: dict[str, Any], terms: HashTerms) -> None:
    """Prefer the current kit when packaged pins drift."""
    mismatches = []
    if str(kit.get("sha256", "")).lower() != terms.sha256:
        mismatches.append("sha256")
    if int(kit.get("bytes", -1)) != terms.bytes:
        mismatches.append("bytes")
    if tuple(kit.get("jobs") or ()) != terms.jobs:
        mismatches.append("jobs")
    if str(kit.get("rootName")) != terms.root_name:
        mismatches.append("rootName")
    if str(kit.get("cli")) != terms.cli:
        mismatches.append("cli")
    if bool(kit.get("purchaseAuthority", False)) != terms.purchase_authority:
        mismatches.append("purchaseAuthority")
    if mismatches:
        raise ClientRefuse(
            "pin-mismatch",
            "packaged hash terms differ from current usefulJobsKit.json; kit is authoritative",
            fields=mismatches,
            kitSha256=kit.get("sha256"),
            kitBytes=kit.get("bytes"),
        )


def default_archive_path(repo_root: Path, terms: HashTerms) -> Path:
    return (repo_root / terms.archive_rel).resolve()


HASH_TERMS = load_packaged_pins()
JOB_IDS = HASH_TERMS.jobs
