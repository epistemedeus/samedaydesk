import subprocess,tempfile,pathlib,os,json
head='ab0a7752780995421da5752d9d6811d56e6d3891'
env={'PATH':os.environ['PATH'],'NODE_ENV':'test'}
checks=[
 ('machine', ['node','server/lib/machine-services/test/run.mjs']),
 ('sqlite', ['node','--test','--test-concurrency=1']),
 ('regression', ['node','--test','--test-concurrency=1',
  'server/scripts/test-hosted-startup.js','server/scripts/test-spa-fallback.js',
  'server/scripts/test-correspondence-mount-disabled.js','server/scripts/test-seller-repair-webhook.js',
  'server/scripts/test-foundry-listener-drain.js']),
]
results=[]
with tempfile.TemporaryDirectory(prefix='ae18-cold-source-') as directory:
 archive=subprocess.Popen(['git','archive',head],stdout=subprocess.PIPE)
 try:
  subprocess.run(['tar','-x','-C',directory],stdin=archive.stdout,check=True)
 finally:archive.stdout.close()
 assert archive.wait()==0
 with open('/tmp/ae18-lifecycle-cold-install.log','w') as out:
  subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--offline'],cwd=directory,env=env,stdout=out,stderr=subprocess.STDOUT,check=True)
 for name,command in checks:
  if name=='sqlite':
   command += [str(p.relative_to(directory)) for pattern in ['server/vendor/machine-gateway/tests/*.test.mjs','server/vendor/continuous-monitoring/test/*.test.mjs'] for p in sorted(pathlib.Path(directory).glob(pattern))]
  log='/tmp/ae18-lifecycle-cold-'+name+'.tap'
  with open(log,'w') as out:
   subprocess.run(command,cwd=directory,env=env,stdout=out,stderr=subprocess.STDOUT,check=True)
  counts={}
  for line in pathlib.Path(log).read_text().splitlines():
   for key in ['tests','pass','fail','cancelled','skipped']:
    if line.startswith('# '+key+' '):counts[key]=int(line.split()[-1])
  results.append({'name':name,'command':command,'log':log,'counts':counts})
pathlib.Path('/tmp/ae18-lifecycle-cold-source.json').write_text(json.dumps({
 'sourceHead':head,'sourceExport':'git archive '+head,
 'coldProductionDependencies':'npm ci --omit=dev --ignore-scripts --no-audit --no-fund --offline',
 'lock':'single parent flock /home/ubuntu/.cache/pilot-ae18-build.lock; child node commands do not acquire it',
 'environment':'sanitized disposable verify-full TLS PostgreSQL fixture only',
 'checks':results,'testTreeRemoved':True,'deployed':False},indent=2)+'\n')
