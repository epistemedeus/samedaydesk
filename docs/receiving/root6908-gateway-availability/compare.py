"""Compare original raw emitted bytes; retain machine bodies without normalization."""
import hashlib, json, sys
from pathlib import Path
out=Path(__file__).parent
before,after=map(Path,sys.argv[1:])
files=lambda root: {str(p.relative_to(root)):p for p in root.rglob('*') if p.is_file()}
a,b=files(before),files(after)
assert a.keys()==b.keys(), 'emitted path inventory changed'
changed=[p for p in sorted(a) if a[p].read_bytes()!=b[p].read_bytes()]
assert changed==['discovery/paid-gateway.json','llms.txt'], changed
human=[p for p in a if p.endswith('.html')]
assets=[p for p in a if p.startswith('assets/')]
assert all(a[p].read_bytes()==b[p].read_bytes() for p in human+assets)
raw_input=json.loads((out/'RECEIVED-STATE.json').read_text())
bound=json.loads((out/'RECEIVED-STATE.bound.json').read_text())
original_receipt=raw_input['received']['receipt']
raw_input['received']['receipt']=bound['received']['receipt']
assert raw_input==bound, 'only receipt binding may change'
assert bound==json.loads(Path('server/config/paid-gateway-availability.json').read_text())
assert '0a5ebf5c93c32927a64fe4146c6848e1bf48c3c7' in bound['received']['receipt']
def outside_block(guide):
    start=guide.index(b'<!-- paid-gateway:start -->')
    end=guide.index(b'<!-- paid-gateway:end -->')+len(b'<!-- paid-gateway:end -->')
    return guide[:start],guide[end:]
assert outside_block(a['llms.txt'].read_bytes())==outside_block(b['llms.txt'].read_bytes())
for label,state,callable_,observed in [('before','paused',False,'2026-10-22T01:50:00.000Z'),('after','available',True,'2026-10-24T23:56:22.400Z')]:
    folder=out/label
    descriptor=json.loads((folder/'descriptor.body').read_bytes())
    assert (descriptor['state'],descriptor['callable'],descriptor['observedAt'])==(state,callable_,observed)
    for name in ['openapi','card']:
        document=json.loads((folder/(name+'.body')).read_bytes())
        gateway=document['x-paid-gateway']
        assert all(gateway[k]==v for k,v in descriptor.items())
    for name in ['skill','llms']:
        body=(folder/(name+'.body')).read_text()
        assert descriptor['summary'] in body and descriptor['nextAction'] in body
    assert f'Paid gateway MCP ({state})' in (folder/'catalog.body').read_text()
    assert (folder/'llms.body').read_bytes()==(a if label=='before' else b)['llms.txt'].read_bytes()
    assert json.loads((a if label=='before' else b)['discovery/paid-gateway.json'].read_bytes())==descriptor
machine=[]
for name in ['descriptor','llms','skill','openapi','catalog','card']:
    first=(out/'before'/(name+'.body')).read_bytes()
    last=(out/'after'/(name+'.body')).read_bytes()
    assert first!=last, name
    machine.append(dict(name=name,beforeBytes=len(first),afterBytes=len(last),beforeSha256=hashlib.sha256(first).hexdigest(),afterSha256=hashlib.sha256(last).hexdigest()))
result=dict(emittedFiles=len(a),emittedBytesBefore=sum(p.stat().st_size for p in a.values()),changedPaths=changed,rawEqualFiles=len(a)-len(changed),rawEqualHumanHTML=len(human),rawEqualAssets=len(assets),allOtherEmittedFilesRawEqual=True,guideOutsideOwnedBlockRawEqual=True,machine=machine,originalReceipt=original_receipt,receivedObservedAt=bound['observedAt'])
(out/'EMISSION-COMPARISON.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
