#!/usr/bin/env python3
"""Inventory and compare every emitted file. No normalization or directory-only hashes."""
import hashlib, json, pathlib, sys
base, candidate, out = map(pathlib.Path, sys.argv[1:])
def inventory(root):
    files=[]
    for p in sorted(root.rglob('*')):
        assert not p.is_symlink(), p
        if p.is_file():
            b=p.read_bytes()
            kind='human-html' if p.suffix=='.html' else ('human-support' if p.suffix in {'.js','.css','.woff2','.png','.ico','.svg'} else 'other')
            files.append(dict(path=str(p.relative_to(root)),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),kind=kind))
    return files
result={'schema':'pilot.root4074.emitted-assets.v1','normalization':'none','inventories':{}}
for label, rel in [('frontend','client/dist'),('desk','vendor/neomorphic-contributor-desk')]:
    a,b=inventory(base/rel),inventory(candidate/rel)
    assert a==b, label+' output differs'
    for member in a:
        assert (base/rel/member['path']).read_bytes()==(candidate/rel/member['path']).read_bytes(), member['path']
    result['inventories'][label]={'path':rel,'allFiles':len(a),'counts':{k:sum(x['kind']==k for x in a) for k in ['human-html','human-support','other']},'files':a,'baselineCandidateRawByteEquality':True}
rel='vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime'
a,b=inventory(base/rel),inventory(candidate/rel)
am,bm={x['path']:x for x in a},{x['path']:x for x in b}
assert am.keys()==bm.keys()
different=[]
for name in am:
    if (base/rel/name).read_bytes()!=(candidate/rel/name).read_bytes():different.append(name)
result['runtime']={'path':rel,'baseline':a,'candidate':b,'allFilesEach':len(a),'rawEqualFiles':len(a)-len(different),'differentPaths':different,
                   'layoutManifestEqual':(base/rel/'runtime-layout.json').read_bytes()==(candidate/rel/'runtime-layout.json').read_bytes()}
assert result['runtime']['layoutManifestEqual']
result['limits']=['Identical explicitly empty frontend service inputs; not real hosted VITE inputs or hosted byte receiving.','Desk is verified committed managed-serving material, not rebuilt from its separate Neomorphic source.','Machine declarations emitted in client/dist are unchanged. MCP inventory and apex declarations are server-generated at request time; machine tests receive those separately.','Runtime materializer/probe output is received in build logs; private qualification/activation remains Root-owned.']
(out/'emitted-assets.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:{x:v[x] for x in ['allFiles','counts','baselineCandidateRawByteEquality']} for k,v in result['inventories'].items()}))
print(json.dumps({k:v for k,v in result['runtime'].items() if k not in {'baseline','candidate','differentPaths'}}))
