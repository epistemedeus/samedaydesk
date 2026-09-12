"""Bounded capture and invocation-scoped process ownership on Linux."""

import json
import math
import os
from pathlib import Path
import selectors
import shutil
import signal
import subprocess
import sys
import tempfile

from .pins import HASH_TERMS
from .refuse import ClientRefuse

MAX_CAPTURE = 1024 * 1024


def resolve_node_bin(explicit=None):
    candidate = explicit or os.environ.get("USEFUL_JOBS_NODE") or shutil.which("node")
    binary = shutil.which(candidate) if candidate else None
    if not binary:
        raise ClientRefuse("missing-node", "Node.js binary not found on PATH; Node >= 22 is required",
                           missing="node", label="missing-node-binary", extracted=True)
    return os.path.abspath(binary)


def _timeout_seconds():
    try:
        value = float(os.environ.get("USEFUL_JOBS_TIMEOUT_SEC", "120"))
    except ValueError:
        value = float("nan")
    if not math.isfinite(value) or not 0 < value <= 300:
        raise ClientRefuse("invalid-timeout", "timeout must be finite, positive and at most 300 seconds")
    return value


def spawn_node(kit, args, *, node_bin=None):
    if sys.platform != "linux" or not Path("/proc/self/task").is_dir():
        raise ClientRefuse("unsupported-platform", "Linux with procfs is required for owned process cleanup")
    timeout = _timeout_seconds()
    command = [resolve_node_bin(node_bin), str(kit.kit_root / HASH_TERMS.cli), *args]
    with tempfile.TemporaryDirectory(prefix="useful-jobs.process-") as work:
        scratch = Path(work) / "scratch"
        scratch.mkdir()
        status_path = Path(work) / "status.json"
        env = dict(os.environ, TMPDIR=str(scratch), TAR_OPTIONS="--no-same-owner")
        owner_read, owner_write = os.pipe()
        proc = None
        captures = [bytearray(), bytearray()]
        try:
            proc = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("_supervise.py")),
                 str(owner_read), str(timeout), str(scratch), str(status_path), *command],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env=env, pass_fds=(owner_read,), start_new_session=True,
            )
            os.close(owner_read)
            owner_read = None
            with selectors.DefaultSelector() as selector:
                for index, stream in enumerate((proc.stdout, proc.stderr)):
                    selector.register(stream, selectors.EVENT_READ, index)
                while selector.get_map() or proc.poll() is None:
                    for key, _ in selector.select(0.1):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                        elif len(captures[key.data]) + len(chunk) > MAX_CAPTURE:
                            raise ClientRefuse("engine-output-limit", "engine stream exceeds 1 MiB", executed=True)
                        else:
                            captures[key.data].extend(chunk)
            proc.wait()
            if proc.returncode or not status_path.is_file():
                raise ClientRefuse("supervision-failed", "process cleanup was not confirmed", executed=True)
            status = json.loads(status_path.read_text())
            if status["reason"] == "timeout":
                raise ClientRefuse("engine-timeout", f"engine exceeded {timeout}s; owned descendants reaped",
                                   executed=True, extracted=True, timedOut=True, engineStatus=status["returncode"])
            if status["reason"]:
                raise ClientRefuse("engine-cancelled", "invocation cancelled and descendants reaped", executed=True)
            try:
                stdout, stderr = (data.decode("utf-8", "strict") for data in captures)
            except UnicodeError as err:
                raise ClientRefuse("invalid-engine-report", "engine stream is not UTF-8", executed=True) from err
            return subprocess.CompletedProcess(command, status["returncode"], stdout, stderr)
        finally:
            os.close(owner_write)
            if owner_read is not None:
                os.close(owner_read)
            if proc is not None:
                if proc.poll() is None:
                    # The liveness pipe tells the supervisor to reap its entire tree.
                    proc.wait(timeout=10)
                proc.stdout.close()
                proc.stderr.close()
