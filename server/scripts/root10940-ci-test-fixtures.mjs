import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {catalogFileName,readIndex} from './root10940-ci-packet.mjs';
// A pending-state negative uses a named fixture, not absence from a live registry.
export function copyCatalogWithoutProfile(from,into,profile){
 mkdirSync(into,{recursive:false});
 const index=readIndex(readFileSync(join(from,'index.json'),'utf8'));
 const packets=index.packets.filter(row=>row.sourceSha256!==profile.sourceSha256||row.hostSha256!==profile.hostSha256);
 for(const row of packets){const name=catalogFileName(row.sourceSha256,row.hostSha256);copyFileSync(join(from,name),join(into,name));}
 writeFileSync(join(into,'index.json'),JSON.stringify({schema:index.schema,packets},null,2)+'\n');
 return into;
}
