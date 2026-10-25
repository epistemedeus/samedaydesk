"""Run one serial command and sample only its process tree. No model children."""
import json, os, subprocess, sys, time
from pathlib import Path
label, *argv = sys.argv[1:]
out = Path(__file__).parent
started = time.time()
peak = 0
samples = 0
aggregate_peak = 0
native_root = int(os.environ.get("ROOT6908_RESOURCE_ROOT_PID", "0"))
native_start = (Path(f"/proc/{native_root}/stat").read_text().rsplit(")", 1)[1].split()[19] if native_root else None)
with (out / (label + '.txt')).open('w') as log:
    child = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT)
    while child.poll() is None:
        table = {}
        for item in Path('/proc').iterdir():
            if not item.name.isdigit(): continue
            try:
                fields = (item / 'stat').read_text().rsplit(')', 1)[1].split()
                table[int(item.name)] = (int(fields[1]), int(fields[21]) * os.sysconf('SC_PAGE_SIZE') // 1024)
            except (OSError, ValueError, IndexError): pass
        owned = {child.pid}
        while True:
            extra = {pid for pid, (parent, rss) in table.items() if parent in owned}
            if extra <= owned: break
            owned |= extra
        peak = max(peak, sum(table.get(pid, (0,0))[1] for pid in owned))
        aggregate = set(owned)
        if native_root:
            try:
                assert Path(f"/proc/{native_root}/stat").read_text().rsplit(")", 1)[1].split()[19] == native_start
                aggregate.add(native_root)
                while True:
                    extra = {pid for pid, (parent, rss) in table.items() if parent in aggregate}
                    if extra <= aggregate: break
                    aggregate |= extra
            except OSError: pass
        aggregate_peak = max(aggregate_peak, sum(table.get(pid, (0,0))[1] for pid in aggregate))
        samples += 1
        time.sleep(.05)
    code = child.wait()
receipt = dict(argv=argv, exit=code, startedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(started)), elapsedSeconds=time.time()-started, sampledCommandTreePeakRSSKiB=peak, samples=samples, sampledOwnedAggregatePeakRSSKiB=aggregate_peak, nativeResourceRootPid=native_root or None, nativeResourceRootStartTicks=native_start, sampleIntervalMs=50, env={k:os.environ.get(k) for k in ['NODE_OPTIONS','UV_THREADPOOL_SIZE','OMP_NUM_THREADS','RAYON_NUM_THREADS','NODE_ENV','SAMEDAYDESK_CLIENT_DIST']})
(out / (label + '.command.json')).write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt))
sys.exit(code)
