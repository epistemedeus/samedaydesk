import subprocess,tempfile,pathlib,os,json,sys
head=subprocess.check_output(['git','rev-parse',sys.argv[1]],text=True).strip()
logs=pathlib.Path(sys.argv[2]).resolve()
logs.mkdir(parents=True,exist_ok=True)
env={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'NODE_ENV':'test','PULSE_PG_BIN':'/usr/lib/postgresql/16/bin'}
checks=[
 ('proxy-addr',['npm','run','test:proxy-addr']),
 ('machine-services',['node','server/lib/machine-services/test/run.mjs']),
 ('sqlite',['node','--test','--test-concurrency=1']),
 ('retained-runtime',['node','--test','--test-concurrency=1','server/scripts/test-hosted-startup.js','server/scripts/test-spa-fallback.js','server/scripts/test-correspondence-mount-disabled.js','server/scripts/test-seller-repair-webhook.js','server/scripts/test-foundry-listener-drain.js']),
 ('contributor-artifacts',['node','--test','--test-concurrency=1','server/scripts/test-neomorphic-contributor-journey-artifact.mjs','server/scripts/test-neomorphic-original-continuation-artifact.mjs']),
 ('original-task',['npm','run','test:original-task']),
]
results=[]
with tempfile.TemporaryDirectory(prefix='ae19-qualified-cold-') as directory:
 archive=subprocess.Popen(['git','archive',head],stdout=subprocess.PIPE)
 try:subprocess.run(['tar','-x','-C',directory],stdin=archive.stdout,check=True)
 finally:archive.stdout.close()
 assert archive.wait()==0
 with (logs/'cold-install.log').open('w') as out:
  subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--offline'],cwd=directory,env=env,stdout=out,stderr=subprocess.STDOUT,check=True)
 for name,command in checks:
  if name=='sqlite':command += [str(p.relative_to(directory)) for pattern in ['server/vendor/machine-gateway/tests/*.test.mjs','server/vendor/continuous-monitoring/test/*.test.mjs'] for p in sorted(pathlib.Path(directory).glob(pattern))]
  log=logs/('cold-'+name+'.tap')
  with log.open('w') as out:subprocess.run(command,cwd=directory,env=env,stdout=out,stderr=subprocess.STDOUT,check=True)
  counts={}
  for line in log.read_text().splitlines():
   for key in ['tests','pass','fail','cancelled','skipped']:
    if line.startswith('# '+key+' '):counts[key]=int(line.split()[-1])
  assert counts.get('fail')==0 and counts.get('skipped')==0,counts
  results.append({'name':name,'command':command,'log':log.name,'counts':counts})
  print(json.dumps({'name':name,'counts':counts}),flush=True)
(logs/'cold-source.json').write_text(json.dumps({'schema':'sds.composed-caller.cold-source.v1','sourceHead':head,'sourceExport':'git archive '+head,'dependencyInstall':'npm ci --omit=dev --ignore-scripts --no-audit --no-fund --offline','lock':'single parent flock; child Node commands do not reacquire it; selected npm scripts do not own it','environment':'sanitized; all DBs disposable; production machine adapter verify-full TLS Postgres','checks':results,'testTreeRemoved':True,'deployed':False},indent=2)+'\n')
