"""Private Linux invocation supervisor; never installed as another entry point.

The liveness pipe survives neither parent exit nor SIGKILL. A subreaper can then
collect detached grandchildren as well as children, without touching the API
caller's other processes. Run as a script to avoid modifying the API host.
"""

import ctypes
import json
import os
import select
import shutil
import signal
import subprocess
import sys
import time


def supervise(owner_fd, timeout, scratch, status_path, command):
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), "cannot enable child subreaping")
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, stop)
    poll = select.poll()
    poll.register(owner_fd, select.POLLHUP | select.POLLERR)
    os.set_inheritable(owner_fd, False)
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, close_fds=True)
    deadline = time.monotonic() + timeout
    cleanup = None
    result = None
    reason = None
    while True:
        empty = False
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                empty = True
                break
            if not pid:
                break
            if pid == child.pid:
                result = os.waitstatus_to_exitcode(status)
                child.returncode = result
        now = time.monotonic()
        if poll.poll(0):
            reason = reason or "owner-exit"
        if stopped:
            reason = reason or "cancelled"
        if result is None and now >= deadline:
            reason = reason or "timeout"
        if result is not None or reason:
            cleanup = cleanup if cleanup is not None else now
            # Only unreaped, kernel-reported children of this dedicated process.
            # Terminating a parent adopts its detached descendants on the next pass.
            with open(f"/proc/self/task/{os.getpid()}/children") as stream:
                children = [int(pid) for pid in stream.read().split()]
            for pid in children:
                try:
                    os.kill(pid, signal.SIGTERM if now - cleanup < 0.2 else signal.SIGKILL)
                except ProcessLookupError:
                    pass
        if empty:
            break
        time.sleep(0.01)
    shutil.rmtree(scratch)
    if reason == "owner-exit":
        shutil.rmtree(os.path.dirname(status_path))
        return
    with open(status_path, "x", encoding="utf-8") as stream:
        json.dump({"returncode": result, "reason": reason, "reaped": True}, stream)


if __name__ == "__main__":
    try:
        supervise(int(sys.argv[1]), float(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5:])
    except Exception as exc:
        print(f"supervisor failed: {exc}", file=sys.stderr)
        sys.exit(125)
