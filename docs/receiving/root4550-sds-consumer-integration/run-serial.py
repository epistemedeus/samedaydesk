#!/usr/bin/env python3
"""Run one command, retaining its output and sampled aggregate owned RSS."""
import json,os,subprocess,sys,time
from pathlib import Path
here=Path(os.environ.get('ROOT4550_RECORD_DIR',str(Path(__file__).resolve().parent)))
here.mkdir(parents=True,exist_ok=True)
name,*command=sys.argv[1:]
assert name and command and '/' not in name
record=Path('/home/ubuntu/root-sol-window100337/root4550-sds-consumer-integration-20261023/admissions/e9eff0da-0436-4a7e-9281-df28f9e7a10a/NATIVE.json')
identity=json.loads(record.read_text());native={identity[k]['pid']:identity[k]['startTime'] for k in ('native','supervisor')}
started=time.time();peak=0;samples=0;seen=set();known={};peak_pids=[]
with (here/(name+'.log')).open('x') as output:
 p=subprocess.Popen(command,stdout=output,stderr=subprocess.STDOUT)
 while True:
  rows={}
  for proc in Path('/proc').iterdir():
   if not proc.name.isdigit():continue
   try:
    stat=(proc/'stat').read_text().rsplit(')',1)[1].split()
    rows[int(proc.name)]=(int(stat[1]),int(stat[19]),int(stat[21])*os.sysconf('SC_PAGE_SIZE')//1024)
   except (OSError,ValueError,IndexError):pass
  owned={p.pid}
  for pid,start in native.items():
   if pid in rows and rows[pid][1]==start:owned.add(pid);seen.add(pid)
  for pid,start in list(known.items()):
   if pid in rows and rows[pid][1]==start:owned.add(pid)
  # Existing fixture helpers daemonize PG. Admit only markers created during
  # this serial command, then retain PID + kernel start time across samples.
  for pattern in ['ae18-postgres-*/data/postmaster.pid','ae14-j1-pg-*/data/postmaster.pid','root*-postgres-*/data/postmaster.pid']:
   for marker in Path('/tmp').glob(pattern):
    try:
     if marker.stat().st_ctime>=started:
      pid=int(marker.read_text().splitlines()[0])
      if pid in rows:owned.add(pid)
    except (OSError,ValueError,IndexError):pass
  while True:
   extra={pid for pid,(parent,_,_) in rows.items() if parent in owned}
   if extra<=owned:break
   owned|=extra
  for pid in owned:
   if pid in rows:known[pid]=rows[pid][1]
  total=sum(rows[pid][2] for pid in owned if pid in rows)
  if total>peak:peak=total;peak_pids=sorted(pid for pid in owned if pid in rows)
  samples+=1
  if total>4194304:
   p.terminate();break
  if p.poll() is not None:break
  time.sleep(.1)
 code=p.wait()
result={'command':command,'cwd':os.getcwd(),'exitCode':code,'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(started)),
 'elapsedSeconds':round(time.time()-started,3),'peakOwnedRssKiB':peak,'reserveKiB':4194304,'nativeObserved':sorted(seen),
 'peakPids':peak_pids,'sampleIntervalMs':100,'samples':samples,'modelChildren':0,
 'scope':'Exact admitted native/supervisor PID+start time, their descendants and newly created detached fixture PostgreSQL. Shared pages repeat in summed RSS; between-sample peaks unmeasured.'}
(here/(name+'.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result));raise SystemExit(code)
