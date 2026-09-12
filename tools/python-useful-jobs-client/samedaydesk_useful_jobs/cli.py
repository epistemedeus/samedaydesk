"""CLI for python -m samedaydesk_useful_jobs."""

from __future__ import annotations

import sys
from typing import Sequence

from .acquire import acquire, acquired_payload, catalog_payload
from .jobs import help_job, list_jobs, run_job
from .pins import HASH_TERMS, JOB_IDS
from .refuse import ClientRefuse, emit, emit_refuse

USAGE = """samedaydesk_useful_jobs - MIT Python 3 client for SameDayDesk useful-jobs

Verifies the in-repo archive sha256 and byte length, extracts to a temp dir,
and runs list / help / run via subprocess Node. No job-engine rewrite. No payment.

Commands:
  acquire [--archive PATH] [--origin URL]
  list
  help [job]
  run <job> [--example | caller flags…]
  catalog
  version

Examples:
  python -m samedaydesk_useful_jobs acquire
  python -m samedaydesk_useful_jobs list
  python -m samedaydesk_useful_jobs run vendor-budget-impact --example
  python -m samedaydesk_useful_jobs run vendor-budget-impact --before before.json --after after.json --out-dir ./out

Notes:
  --example is a labeled SAMPLE fixture, never a sale.
  Optional --origin is fetched then still verified; mismatch refuses before extract.
  Default acquire uses the committed tarball (not live HTTP).
"""


def _take_option(args: list[str], name: str) -> tuple[str | None, list[str]]:
    flag = f"--{name}"
    out: list[str] = []
    value = None
    i = 0
    while i < len(args):
        item = args[i]
        if item == flag:
            if i + 1 >= len(args) or args[i + 1].startswith("--"):
                raise ClientRefuse("missing-args", f"{flag} requires a value")
            value = args[i + 1]
            i += 2
            continue
        if item.startswith(flag + "="):
            value = item.split("=", 1)[1]
            i += 1
            continue
        out.append(item)
        i += 1
    return value, out


def _exit_for(payload: dict) -> int:
    if payload.get("ok") is True:
        return 0
    return 2


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        if not args or args[0] in ("-h", "--help"):
            emit(
                {
                    "ok": True,
                    "command": "usage",
                    "usage": USAGE,
                    "jobs": list(JOB_IDS),
                    "sold": False,
                    "purchaseAuthority": False,
                }
            )

        command = args[0]
        origin, rest = _take_option(args[1:], "origin")
        archive, rest = _take_option(rest, "archive")

        if command == "acquire":
            kit = acquire(archive=archive, origin=origin)
            emit(acquired_payload(kit))

        if command == "list":
            payload = list_jobs(archive=archive, origin=origin)
            emit(payload, _exit_for(payload))

        if command == "help":
            job = next((item for item in rest if not item.startswith("--")), None)
            payload = help_job(job, archive=archive, origin=origin)
            emit(payload, _exit_for(payload))

        if command == "run":
            if not rest or rest[0].startswith("--"):
                raise ClientRefuse("missing-job", "run requires a catalog job id")
            job_id, job_args = rest[0], rest[1:]
            payload = run_job(job_id, job_args, archive=archive, origin=origin)
            emit(payload, _exit_for(payload))

        if command == "catalog":
            kit = acquire(archive=archive, origin=origin)
            emit(catalog_payload(kit))

        if command == "version":
            emit(
                {
                    "ok": True,
                    "command": "version",
                    "client": "samedaydesk_useful_jobs 1.0.1",
                    "package": HASH_TERMS.package,
                    "version": HASH_TERMS.version,
                    "sha256": HASH_TERMS.sha256,
                    "bytes": HASH_TERMS.bytes,
                    "sold": False,
                    "purchaseAuthority": False,
                }
            )

        raise ClientRefuse("unknown-command", f"unknown command {command}", usage=USAGE)
    except ClientRefuse as err:
        emit_refuse(err)
    except BrokenPipeError:
        return 0
    return 0
