#!/usr/bin/env python3
"""Bind the explicitly owned cohort delta to an exact committed source tree."""
import subprocess,json,hashlib
from pathlib import Path
out=Path(__file__).resolve().parent
base='79fbd37d31aabdc790248443c576a2f0017e55f0'
candidate=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
def raw(ref,p):return subprocess.check_output(['git','show',ref+':'+p])
def sha(b):return hashlib.sha256(b).hexdigest()
paths=subprocess.check_output(['git','diff','--name-only',base,candidate],text=True).splitlines()
paths=[p for p in paths if not p.startswith('docs/receiving/root4550-sds-consumer-integration/')]
owned={'server/lib/machine-services/monitor-manifest.mjs','server/lib/machine-services/mount.mjs','server/lib/machine-services/test/monitor-manifest-journey.test.mjs','server/vendor/continuous-monitoring/src/api.mjs','server/vendor/continuous-monitoring/openapi.json','vendor/hosted-wallet-market/src/machine-market.mjs','vendor/hosted-wallet-market/src/market-interest-read.mjs','server/scripts/test-r4-requester-proposal-review.mjs','vendor/hosted-wallet-market/src/server.mjs','vendor/hosted-wallet-market/src/wallet-continuation.mjs','server/scripts/test-r4-wallet-continuation.mjs','vendor/hosted-wallet-market/src/retained-outcome.mjs','server/scripts/test-root425-cold-mutation.mjs','vendor/hosted-wallet-market/SOURCE.json','server/foundry/activation/private-control-pin.json','vendor/hosted-wallet-market/contracts/machine-runtime.json'}
assert set(p for p in paths if not p.startswith('docs/receiving/'))==owned
package={};host={}
for ref in [base,candidate]:
 names=subprocess.check_output(['git','ls-tree','-r','--name-only',ref,'vendor/hosted-wallet-market'],text=True).splitlines()
 prefix='vendor/hosted-wallet-market/'
 names=[p for p in names if p[len(prefix):] in ['package.json','package-lock.json'] or p[len(prefix):].split('/')[0] in ['bin','client','contracts','schema','src','runtime']]
 package[ref]={p:sha(raw(ref,p)) for p in names}
 pin='server/foundry/activation/private-control-pin.json';mapping=json.loads(raw(ref,pin))['files']
 host[ref]={p:sha(raw(ref,p)) for p in [*mapping,pin]}
 for p,digest in mapping.items():assert host[ref][p]==digest

def delta(sets):
 a,b=sets[base],sets[candidate]
 return [{'path':p,'before':a.get(p),'after':b.get(p)} for p in sorted(a.keys()|b.keys()) if a.get(p)!=b.get(p)]
pd,hd=delta(package),delta(host)
expected_package={p for p in owned if p.startswith('vendor/hosted-wallet-market/src/')}|{'vendor/hosted-wallet-market/contracts/machine-runtime.json'}
assert {x['path'] for x in pd}==expected_package
expected_host=expected_package|{'vendor/hosted-wallet-market/SOURCE.json','server/foundry/activation/private-control-pin.json','server/lib/machine-services/monitor-manifest.mjs','server/lib/machine-services/mount.mjs','server/vendor/continuous-monitoring/src/api.mjs','server/vendor/continuous-monitoring/openapi.json'}
assert {x['path'] for x in hd}==expected_host
result={'schema':'root4550.exact-allowed-delta.v1','baseline':base,'sourceCommit':candidate,'sourceTree':subprocess.check_output(['git','rev-parse',candidate+'^{tree}'],text=True).strip(),'files':{p:sha(raw(candidate,p)) for p in paths},'packageDelta':pd,'hostDelta':hd,'rationale':'Only exact received source owners and original immutable reports, causal consumer/fixture repairs, maintained runtime file-map correction and existing canonical producer output. Financial authority, Neo and dependency locks remain exact.'}
(out/'ALLOWED-DELTA.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'sourceCommit':candidate,'changedPaths':len(paths),'packageDelta':len(pd),'hostDelta':len(hd)}))
