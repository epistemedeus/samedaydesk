import fs from 'node:fs';
import {stageReleaseSource,admitReleaseSource} from './support/controller/tools/ops/hostinger-release-source.mjs';
const root='/tmp/r6q-oec4g5lv';
process.execPath=root+'/bounded-node';
const checkout='/home/ubuntu/ae14-work/root5950-mcp-refusal-reasons-20261024';
const common={repository:'epistemedeus/samedaydesk',neomorphicCommit:'a0c97a594cebe73236e95caa6c4028bb36a60be9',neomorphicDeskCommit:'0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556'};
for (const [name,commit] of [['baseline','f629597d9e865bd6709d4b10d96a9905cc9ea3c3'],['repaired','40c4c692f5f24f13f056b4ebae4cbf48d91f0890']]) {
 const manifest={...common,commit};
 const options={manifest,sourceCheckout:checkout,sdsRoot:root+'/source-bounded-'+name,dependenciesRoot:root+'/'+name,entryClosure:true};
 const staged=await stageReleaseSource(options);fs.writeFileSync(root+'/results/source-bounded-'+name+'-stage.json',JSON.stringify(staged,null,2)+'\n');
 const admitted=await admitReleaseSource(options);fs.writeFileSync(root+'/results/source-bounded-'+name+'-admit.json',JSON.stringify(admitted,null,2)+'\n');
 console.log(JSON.stringify({name,staged,admitted}));
}
