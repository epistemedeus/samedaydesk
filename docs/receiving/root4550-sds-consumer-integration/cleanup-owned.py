#!/usr/bin/env python3
"""Inspect stopped fixtures and remove only this job's disposable source copies."""
import json,os,subprocess,shutil
from pathlib import Path
here=Path(__file__).resolve().parent
identity=json.loads(Path('/home/ubuntu/root-sol-window100337/root4550-sds-consumer-integration-20261023/admissions/e9eff0da-0436-4a7e-9281-df28f9e7a10a/NATIVE.json').read_text())
rows={}
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  raw=(p/'stat').read_text();fields=raw.rsplit(')',1)[1].split();rows[int(p.name)]={'parent':int(fields[1]),'startTime':int(fields[19]),'state':fields[0],'comm':raw.split('(',1)[1].rsplit(')',1)[0],'rssKiB':int(fields[21])*os.sysconf('SC_PAGE_SIZE')//1024,'args':(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')}
 except (OSError,ValueError,IndexError):pass
owned=set()
for key in ['supervisor','native']:
 r=identity[key];assert rows[r['pid']]['startTime']==r['startTime'];owned.add(r['pid'])
while True:
 new={pid for pid,r in rows.items() if r['parent'] in owned}
 if new<=owned:break
 owned|=new
pg=[{'pid':pid,**{k:v for k,v in rows[pid].items() if k!='args'}} for pid in sorted(owned) if rows[pid]['comm']=='postgres']
assert all(r['state']=='Z' and r['rssKiB']==0 for r in pg),pg
liveTests=[pid for pid in owned if rows[pid]['comm']=='node' and rows[pid]['state']!='Z' and (' --test ' in rows[pid]['args'] or 'R4_WALLET_FIXTURE' in rows[pid]['args'])]
assert not liveTests,liveTests
copies=[]
for name in ['baseline','candidate','final']:
 root=Path('/tmp/root4550-qualification')/name
 status=subprocess.check_output(['git','-C',str(root),'status','--short','--untracked-files=no'],text=True)
 assert status=='',status
 copies.append({'path':str(root),'head':subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),'trackedCleanAfterBuild':True})
 subprocess.run(['git','worktree','remove','--force',str(root)],check=True)
for name in ['/tmp/root4550-qualification','/tmp/root4550-operating']:
 p=Path(name);assert p.parent==Path('/tmp') and p.name.startswith('root4550-')
 if p.exists():shutil.rmtree(p)
(here/'CLEANUP.json').write_text(json.dumps({'schema':'root4550.owned-cleanup.v1','sourceCopies':copies,'liveOwnedPostgres':0,'liveOwnedTestNodes':liveTests,'exitedPostgresAwaitingSupervisorReap':pg,'temporaryRootsRemoved':['/tmp/root4550-qualification','/tmp/root4550-operating'],'otherJobsTouched':False,'note':'Fixtures stopped their exact owned postmasters. Exited Z/RSS0 entries are children of the admitted supervisor and can only be reaped by it on normal job termination; no foreign or native supervisor was signalled.'},indent=2)+'\n')
print(json.dumps({'temporaryCopiesRemoved':len(copies),'liveOwnedPostgres':0,'liveOwnedTestNodes':0,'exitedPgAwaitingSupervisorReap':len(pg),'otherJobsTouched':False}))
