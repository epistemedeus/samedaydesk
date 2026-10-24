#!/usr/bin/env python3
"""Serial owned fixture runner: subreap detached PG, sample descendants, no deadline."""
import ctypes, json, os, pathlib, subprocess, sys, tempfile, time
ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0)
root = pathlib.Path(tempfile.mkdtemp(prefix='r6712-', dir='/tmp'))
env = dict(os.environ, TMPDIR=str(root), NODE_OPTIONS='--max-old-space-size=512', UV_THREADPOOL_SIZE='1', OMP_NUM_THREADS='1')
started = time.monotonic()
child = subprocess.Popen(sys.argv[1:], env=env)
peak = 0
def descendants(pid):
    result = {pid}
    try:
        for part in pathlib.Path(f'/proc/{pid}/task/{pid}/children').read_text().split():
            result |= descendants(int(part))
    except FileNotFoundError:
        pass
    return result
while child.poll() is None:
    current = descendants(os.getpid())
    native_pid = int(env.get('ROOT6712_NATIVE_PID', '0'))
    if native_pid:
        status = pathlib.Path(f'/proc/{native_pid}/stat').read_text()
        if status.rsplit(')', 1)[1].split()[19] != env['ROOT6712_NATIVE_START']:
            raise RuntimeError('native identity changed')
        current |= descendants(native_pid)
    total = 0
    for pid in current:
        try:
            for line in pathlib.Path(f'/proc/{pid}/status').read_text().splitlines():
                if line.startswith('VmRSS:'):
                    total += int(line.split()[1])
        except FileNotFoundError:
            pass
    peak = max(peak, total)
    time.sleep(.05)
code = child.wait()
reaped = 0
while True:
    try:
        pid, _ = os.waitpid(-1, os.WNOHANG)
        if not pid:
            break
        reaped += 1
    except ChildProcessError:
        break
remaining = sorted(descendants(os.getpid()) - {os.getpid()})
# The existing app's singleton Pulse fallback is isolated by this TMPDIR.
fallback = root / 'sdd-pulse-v1.json.fallback.json'
if fallback.is_file():
    fallback.unlink()
contents = sorted(p.name for p in root.iterdir())
if not contents:
    root.rmdir()
print(json.dumps(dict(runner='root6712-owned-subreaper', exit=code, elapsedMs=round((time.monotonic()-started)*1000, 3), peakDescendantRssKiB=peak, totalReserveKiB=2097152, nativeIncluded=bool(env.get('ROOT6712_NATIVE_PID')), reaped=reaped, remainingOwnedPids=remaining, remainingScratch=contents)), flush=True)
# A leftover is an explicit failed cleanup, never a broad process kill.
sys.exit(code if code else int(bool(remaining or contents) or peak >= 2097152))
