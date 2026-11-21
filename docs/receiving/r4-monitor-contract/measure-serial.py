import argparse, json, os, subprocess, time
from pathlib import Path
root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--native-record',required=True)
args=parser.parse_args()
# Native identity is the admitted job's exact saved PID/start-time pair, not an
# arbitrary process selected from this shared host.
admission=json.loads(Path(args.native_record).read_text())
native={admission[k]['pid']:admission[k]['startTime'] for k in ('native','supervisor')}
log=root/'docs/receiving/r4-monitor-contract/final.tap'
started=time.time()
with log.open('w') as out:
 p=subprocess.Popen(['node','--test','--test-concurrency=1','server/lib/machine-services/test/monitor-manifest-journey.test.mjs','server/lib/machine-services/test/lifecycle.test.mjs'],cwd=root,stdout=out,stderr=subprocess.STDOUT,env={**os.environ,'NODE_OPTIONS':'--max-old-space-size=512'})
 peak=0; native_seen=set(); samples=0; peak_pids=[]
 while p.poll() is None:
  rows={}
  for proc in Path('/proc').iterdir():
   if not proc.name.isdigit(): continue
   try:
    raw=(proc/'stat').read_text(); after=raw.rsplit(')',1)[1].split();
    rows[int(proc.name)]=(int(after[1]),int(after[19]),int(after[21])*os.sysconf('SC_PAGE_SIZE')//1024)
   except (OSError,ValueError,IndexError): pass
  owned={p.pid}
  # Postgres is a detached owned fixture. Its exact per-test path and marker
  # are unique to this job; only clusters created after this run are included.
  for scratch in Path('/tmp').glob('ae18-postgres-root4431-*'):
   try:
    marker=scratch/'data/postmaster.pid'
    if scratch.stat().st_ctime>=started-1: owned.add(int(marker.read_text().splitlines()[0]))
   except (OSError,ValueError,IndexError): pass
  for pid,start in native.items():
   if pid in rows and rows[pid][1]==start: owned.add(pid); native_seen.add(pid)
  # This admitted supervisor owns only this job. Include its native launcher,
  # actual runtime, tool transport and descendants in the same total reserve.
  descend=set(owned)
  while True:
   new={pid for pid,(ppid,_,_) in rows.items() if ppid in descend}
   if new<=descend: break
   descend|=new
  owned|=descend
  total=sum(rows[pid][2] for pid in owned if pid in rows)
  if total>peak: peak=total;peak_pids=sorted(pid for pid in owned if pid in rows)
  samples+=1
  if total>2097152:
   p.terminate();raise SystemExit('owned resource reserve exceeded; test terminated')
  time.sleep(.05)
code=p.wait()
record={'schema':'root4431.serial-test-resources.v1','exitCode':code,'elapsedSeconds':round(time.time()-started,3),'sampleIntervalMs':50,'samples':samples,'peakOwnedRssKiB':peak,'reserveKiB':2097152,'nativeIdentitiesObserved':sorted(native_seen),'peakOwnedPids':peak_pids,'modelChildren':0,'limit':'Sampled RSS sum of the exact admitted native/supervisor trees, test descendants and this run disposable PostgreSQL. RSS counts shared pages repeatedly; between-sample peaks and earlier setup are not measured.'}
(root/'docs/receiving/r4-monitor-contract/RESOURCES.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
raise SystemExit(code)
