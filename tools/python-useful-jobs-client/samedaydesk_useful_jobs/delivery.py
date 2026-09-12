"""Consumer-owned output publication and released envelope checks."""

from contextlib import contextmanager
import ctypes
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

from .pins import HASH_TERMS
from .refuse import ClientRefuse

MAX_ARTIFACT = 8 * 1024 * 1024


def strict_json(text):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError("duplicate JSON key")
            value[key] = item
        return value

    def constant(value):
        raise ValueError(f"non-finite JSON: {value}")

    text.encode("utf-8", "strict")
    value = json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
    # Also reject unpaired surrogates and exponent overflow after decoding.
    json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8", "strict")
    return value


def _parent_fd(path, create=False):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open("/", flags)
    try:
        for part in path.parts[1:]:
            if create:
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def _identity(fd):
    info = os.fstat(fd)
    return info.st_dev, info.st_ino


def _rename_new(stage, parent_fd, name):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        raise ClientRefuse("unsupported-platform", "Linux renameat2 is required")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(stage), parent_fd, os.fsencode(name), 1):
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), name)


@contextmanager
def publication(output):
    """Stage under a pinned parent and atomically refuse any occupied target."""
    output = Path(os.path.abspath(output))
    fd = None
    executed = False
    try:
        fd = _parent_fd(output.parent, create=True)
        try:
            os.stat(output.name, dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise FileExistsError(str(output))
        anchor = Path(f"/proc/{os.getpid()}/fd/{fd}")
        with tempfile.TemporaryDirectory(prefix=".useful-jobs-publish-", dir=anchor) as work:
            stage = Path(work) / "result"

            def publish():
                check_fd = _parent_fd(output.parent)
                try:
                    if _identity(check_fd) != _identity(fd):
                        raise ClientRefuse("output-parent-changed", "output parent changed during execution", executed=True)
                finally:
                    os.close(check_fd)
                _rename_new(stage, fd, output.name)

            executed = True
            yield stage, publish
    except FileExistsError as err:
        raise ClientRefuse("occupied-output", "output destination exists; existing entry preserved", executed=executed) from err
    except OSError as err:
        raise ClientRefuse("output-io-failed", str(err), executed=executed) from err
    finally:
        if fd is not None:
            os.close(fd)


def _require(condition):
    if not condition:
        raise ValueError("artifact differs from the released job/report envelope")


def validate_body(body, job, report):
    _require(isinstance(body, dict))
    _require(not any(body.get(key) is True for key in ("refused", "sold", "sale", "purchaseAuthority")))
    _require(body.get("ok") is not False)
    if job == "page-change-offline-job":
        _require(isinstance(body.get("report"), dict))
        _require(body["report"].get("schema") == "pilot/page-change-brief/v1")
        _require(body["report"] == report.get("report"))
    elif job == "route-table-diff":
        _require(body.get("schema") == report.get("schema") == "samedaydesk.route-diff.v1")
        _require(body.get("ok") is True and isinstance(body.get("counts"), dict))
        _require(body.get("outcome") == report.get("outcome") and body.get("outcome") in
                 {"breaking", "changed", "title-only", "permutation", "no-change"})
        _require(all(isinstance(body.get(key), list) for key in ("added", "removed", "changed", "collisions")))
    else:
        schema = {"lockfile-pin-delta": "samedaydesk.lockfile-pin-delta.v1",
                  "json-schema-webhook-drift": "samedaydesk.json-schema-webhook-drift.v1"}.get(job, "s233.useful-application.artifact.v1")
        _require(body.get("schema") == schema)
        _require(body.get("appId") == report.get("appId") == job)
        _require(body.get("status") == report.get("status") and body.get("status") in {"actionable", "informational", "partial"})
        if job == "lockfile-pin-delta":
            _require(body.get("ok") is True and isinstance(body.get("counts"), dict))
            _require(all(isinstance(body.get(key), list) for key in ("added", "removed", "changed", "gaps")))
        elif job == "json-schema-webhook-drift":
            _require(isinstance(body.get("impact"), dict))
            _require(all(isinstance(body["impact"].get(key), list) for key in ("breaking", "compatible", "unknown", "deleted", "added")))
            _require(isinstance(body.get("termsVersion"), str) and body["termsVersion"] == report.get("termsVersion"))
        else:
            _require(isinstance(body.get("summary"), str) and body["summary"].strip())
            _require(all(isinstance(body.get(key), list) for key in ("actions", "gaps")))
            _require(body.get("noPurchaseAuthority") is True)
            _require(isinstance(body.get("digest"), str) and body["digest"] == report.get("digest"))


def validate_outputs(stage, job, report):
    expected = list(HASH_TERMS.outputs_for(job))
    if stage.is_symlink() or not stage.is_dir():
        raise ClientRefuse("missing-output", "engine produced no owned output directory", executed=True,
                           missing=expected, outcome="missing-output")
    found = [p.name for p in stage.iterdir()]
    missing = [name for name in expected if name not in found]
    if missing:
        raise ClientRefuse("missing-output", "engine omitted promised artifacts", executed=True,
                           missing=missing, outcome="missing-output")
    if sorted(found) != sorted(expected):
        raise ClientRefuse("unexpected-output", "engine produced an unexpected artifact set", executed=True)
    artifacts = []
    total = 0
    for name in expected:
        path = stage / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid():
            raise ClientRefuse("unsafe-output", "artifact must be an owned regular file without links", executed=True)
        total += info.st_size
        if not 0 < info.st_size <= MAX_ARTIFACT or total > 16 * 1024 * 1024:
            raise ClientRefuse("invalid-artifact-content", "artifact is empty or exceeds byte limits", executed=True)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            opened = os.fstat(stream.fileno())
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise ClientRefuse("unsafe-output", "artifact changed before validation", executed=True)
            data = stream.read(MAX_ARTIFACT + 1)
        stable = lambda st: (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns, st.st_nlink)
        if len(data) != info.st_size or stable(path.lstat()) != stable(info):
            raise ClientRefuse("unsafe-output", "artifact changed during validation", executed=True)
        try:
            text = data.decode("utf-8", "strict")
            _require(bool(text.strip()) and "\x00" not in text)
            if name.endswith(".json"):
                validate_body(strict_json(text), job, report)
            elif name.endswith(".md"):
                _require(text.startswith("# ") and text.endswith("\n"))
            elif name.endswith(".ics"):
                lines = text.splitlines()
                _require(lines[0] == "BEGIN:VCALENDAR" and lines[-1] == "END:VCALENDAR" and "VERSION:2.0" in lines)
                stack = []
                for line in lines:
                    if line.startswith("BEGIN:"):
                        stack.append(line[6:])
                    elif line.startswith("END:"):
                        _require(bool(stack) and stack.pop() == line[4:])
                _require(not stack)
        except (ValueError, UnicodeError, RecursionError, TypeError) as err:
            raise ClientRefuse("invalid-artifact-content", f"invalid {name}: {err}", executed=True) from err
        artifacts.append({"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return artifacts
