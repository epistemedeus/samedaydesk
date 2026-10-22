"""Linux ownership primitives. These are lifecycle controls, not a sandbox."""

from __future__ import annotations

import ctypes
import errno
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path


# Run in a separate interpreter so subreaping cannot adopt another caller's
# children in the Python API host. A released CLI creates detached sessions;
# process-group killing alone cannot contain that tree. No engine is patched.
SUPERVISOR = r'''
import ctypes, os, signal, sys, time
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
    sys.exit(125)
stopping = False
def stop(signum, frame):
    global stopping
    stopping = True
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
deadline = time.monotonic() + float(sys.argv[1])
root = os.fork()
if root == 0:
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    try:
        os.execvpe(sys.argv[2], sys.argv[2:], os.environ)
    except OSError:
        os._exit(127)
status = None
cleanup_at = None
timed_out = False
children_path = '/proc/self/task/%d/children' % os.getpid()
while True:
    no_children = False
    while True:
        try:
            pid, code = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            no_children = True
            break
        if pid == 0:
            break
        if pid == root:
            status = os.waitstatus_to_exitcode(code)
    now = time.monotonic()
    if status is None and (stopping or now >= deadline):
        timed_out = True
    if status is not None or timed_out or stopping:
        if cleanup_at is None:
            cleanup_at = now
        # These are kernel-reported children of this dedicated subreaper.
        # Killing a parent adopts even setsid() grandchildren on the next pass.
        with open(children_path) as handle:
            children = [int(value) for value in handle.read().split()]
        for child in children:
            try:
                os.kill(child, signal.SIGTERM if now - cleanup_at < .2 else signal.SIGKILL)
            except ProcessLookupError:
                pass
    if no_children:
        break
    time.sleep(.01)
sys.exit(124 if timed_out else (status if status is not None and status >= 0 else 1))
'''


def rename_noreplace(source: Path, parent_fd: int, name: str) -> None:
    """Atomically publish without replacing even an empty directory or link."""
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        raise OSError(errno.ENOSYS, "Linux renameat2 is required")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), parent_fd, os.fsencode(name), 1) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), name)


@contextmanager
def publication(output: Path):
    """Pin each parent directory, reject links, and stage on its filesystem."""
    output = Path(os.path.abspath(output))
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    parent_fd = os.open("/", flags)
    try:
        for part in output.parent.parts[1:]:
            try:
                next_fd = os.open(part, flags, dir_fd=parent_fd)
            except FileNotFoundError:
                try:
                    os.mkdir(part, 0o700, dir_fd=parent_fd)
                except FileExistsError:
                    pass
                next_fd = os.open(part, flags, dir_fd=parent_fd)
            os.close(parent_fd)
            parent_fd = next_fd
        try:
            os.stat(output.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise FileExistsError(errno.EEXIST, "output already exists", str(output))
        parent_identity = os.fstat(parent_fd)
        # A child process can use the supervisor's parent's proc-fd pathname
        # without inheriting an fd. Parent renames cannot redirect its writes.
        anchor = Path(f"/proc/{os.getpid()}/fd/{parent_fd}")
        with tempfile.TemporaryDirectory(prefix=".cw06-publish-", dir=anchor) as work:
            stage = Path(work) / "result"

            def publish():
                current = output.parent.stat()
                if (current.st_dev, current.st_ino) != (parent_identity.st_dev, parent_identity.st_ino):
                    raise OSError(errno.ESTALE, "output parent changed during execution")
                rename_noreplace(stage, parent_fd, output.name)

            yield stage, publish
    finally:
        os.close(parent_fd)
