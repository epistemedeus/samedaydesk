import subprocess,pathlib,tarfile,io,gzip,hashlib,json,sys
head=subprocess.check_output(['git','rev-parse',sys.argv[1]],text=True).strip()
base='1a55f55807e4cfef04dde3252619cdcbae0716dc'
root=pathlib.Path('server/lib/machine-services')
out=pathlib.Path('/tmp/sds-ae19-qualified-'+head[:8]+'-source.tgz')
patch=pathlib.Path('/tmp/sds-ae19-qualified-'+head[:8]+'-amendment.patch')
scope=['package.json','package-lock.json','server/app.js','server/index.js',str(root),'server/vendor/machine-gateway','server/vendor/continuous-monitoring','server/foundry/activation/private-control-pin.json','server/scripts/test-proxy-addr-patch.js','server/scripts/test-foundry-private-pass.js','vendor/neomorphic-contributor-journey/SOURCE.json']
excluded=[str(root/'RESULT.md'),str(root/'deploy/DEPLOYMENT.json'),str(root/'deploy/SHA256SUMS'),str(root/'test/evidence/')]
raw=subprocess.check_output(['git','archive',head,*scope])
with tarfile.open(fileobj=io.BytesIO(raw)) as source,out.open('wb') as output:
 with gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0) as compressed:
  with tarfile.open(fileobj=compressed,mode='w|') as target:
   for member in source:
    if any(member.name==name.rstrip('/') or member.name.startswith(name) for name in excluded):continue
    target.addfile(member,source.extractfile(member) if member.isfile() else None)
patch.write_bytes(subprocess.check_output(['git','diff','--binary',base,head,'--',*scope]))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
manifest=json.loads((root/'deploy/DEPLOYMENT.json').read_text())
manifest.update(sourceHead=head,previousExport=base,previousTestedImplementation='ab0a7752780995421da5752d9d6811d56e6d3891',sourceScope=scope,previousOverlaySha256=manifest['overlayPackage']['sha256'])
manifest['overlayPackage'].update(path=str(out),sha256=sha(out),bytes=out.stat().st_size,reportingFilesExcluded=excluded)
manifest['amendmentSourcePatch'].update(base=base,path=str(patch),sha256=sha(patch))
manifest['files']={name:sha(root/name) for name in manifest['files']}
manifest['sourceOnlyLifecycleAmendment']=False
manifest['sourceOnlyQualificationAmendment']=True
manifest['sourceAmendmentRollback']={'head':base,'warning':'historical feature source, not evidence this source was deployed'}
manifest['codeRollback']={'source':'Root exact completed deployed predecessor journal','environment':'controller rollbackPacket exact original full set','retainSchemasAndReceipts':True,'preserveCompleteEnvironment':True,'neverReplayUnknownBuild':True}
manifest['sourceQualification']=json.loads((root/'PINS.json').read_text())['sourceQualification']
manifest['releaseController']={'repository':'epistemedeus/pilot','branch':'codex/ae19-preserving-host-release-243001','exportHead':'931b7166842cbb0aa6db2041150041f9798dc49a','testedImplementation':'abf7239f0e414677cd1795ba08158f44957bb149','pr':412,'profile':'preserve-private-machine-services','sourceUnchanged':True,'manifestCandidate':'final source export in outer installation bundle; runtime/source bytes equal sourceHead'}
manifest['sourceQualification']['deploymentQualification']='Root actual transport receiving; old incompatible signed source must refuse before writes'
manifest['configurationContractChangedByAmendment']=False
manifest['migrationSchemaChangedByAmendment']=False
(root/'deploy/DEPLOYMENT.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'deploy/SHA256SUMS').write_text(sha(out)+'  '+str(out)+'\n'+sha(patch)+'  '+str(patch)+'\n'+sha('server/vendor/machine-gateway/releases/neomorphic-machine-gateway-0.1.1.tgz')+'  server/vendor/machine-gateway/releases/neomorphic-machine-gateway-0.1.1.tgz\n')
print(json.dumps({'sourceHead':head,'overlay':str(out),'sha256':sha(out),'bytes':out.stat().st_size,'amendment':str(patch),'amendmentSha256':sha(patch),'members':sum(1 for m in tarfile.open(out) if m.isfile())}))
