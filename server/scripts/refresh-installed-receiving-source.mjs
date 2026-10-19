// Mechanical source export for the interpreted installed debt consumer. Its
// .mjs files are the maintained SDS source, not generated TypeScript output.
// The Neo TypeScript runtime uses its separate declared runtime exporter first.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installedSourceSha256} from '../../vendor/hosted-wallet-market/src/native-debt.mjs';
import {verifyContributorRuntime} from '../lib/contributor-artifact.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=name=>readFile(path.join(root,name));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestName='vendor/hosted-wallet-market/SOURCE.json';
const manifest=JSON.parse(await read(manifestName));
manifest.installedSourceSha256=installedSourceSha256();
manifest.receivingSource={repository:'epistemedeus/samedaydesk',baseCommit:'2ebdd605708d91d3638ecbc9c640e570a9ad483e',
  predecessorConsumerSha256:'36dc4d34b003349ed5a6fd5ba5a50229ab4779291712ff84412e8e76125b451b',
  exportCommand:'node server/scripts/refresh-installed-receiving-source.mjs',
  scope:'interpreted native discharge reader; existing runtime dependencies preserved'};
const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
const pinName='server/foundry/activation/private-control-pin.json';
const pin=JSON.parse(await read(pinName));
const next={...pin.files};
const neoPrefix='vendor/neomorphic-contributor-journey/';
const neo=JSON.parse(await read(neoPrefix+'SOURCE.json'));
await verifyContributorRuntime(path.join(root,neoPrefix),neo.sourceCommit);
for(const name of Object.keys(next))if(name.startsWith(neoPrefix))delete next[name];
for(const member of [...neo.files.map(file=>file.path),'SOURCE.json'])next[neoPrefix+member]=sha(await read(neoPrefix+member));
for(const name of Object.keys(next)){
  if(name===manifestName){next[name]=sha(manifestBytes);continue;}
  const got=sha(await read(name));
  if(name.startsWith('vendor/hosted-wallet-market/')||name==='server/lib/hosted-wallet-market-mount.js'||name==='server/scripts/refresh-installed-receiving-source.mjs')next[name]=got;
  else if(next[name]!==got)throw Error('unrelated source pin drift: '+name);
}
// The read-only Root CLI entry and this source exporter are part of the host.
next['server/lib/hosted-wallet-market-mount.js']=sha(await read('server/lib/hosted-wallet-market-mount.js'));
next['server/scripts/refresh-installed-receiving-source.mjs']=sha(await read('server/scripts/refresh-installed-receiving-source.mjs'));
await writeFile(path.join(root,manifestName),manifestBytes);
await writeFile(path.join(root,pinName),JSON.stringify({...pin,files:next},null,2)+'\n');
process.stdout.write(JSON.stringify({consumerSourceSha256:manifest.installedSourceSha256,hostMembers:Object.keys(next).length,qualified:false,installed:false})+'\n');
