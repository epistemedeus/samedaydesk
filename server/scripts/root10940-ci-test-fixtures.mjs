import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {buildUnreceivedPair,catalogFileName,CURRENT_PROPOSAL_DIR,readIndex,sha256} from './root10940-ci-packet.mjs';

// Retained proposals describe their original source, not each later working tree.
// Keep their exact bytes checked while current positive cases use disposable input.
export function retainedProposal(root) {
 const hashes={
  'proposed-anchor.json':'dee2ba5fae58182e6ffaa9d767626418d26fba3ebe4b0efe1bc842a5bbbe8580',
  'proposed-descriptor.json':'d366ae016d89e30b13e8626b2f3ab07eb81f64e502f8256a6ef20106645fd8da',
  'ENROLLMENT.json':'d1f153f2c61b55d74708a26f8a15250397aa9f26621dca40851b02e3cef95950',
 };
 const values={};
 for(const[name,hash]of Object.entries(hashes)){
  const bytes=readFileSync(join(root,CURRENT_PROPOSAL_DIR,name));
  assert.equal(sha256(bytes),hash,`retained proposal changed: ${name}`);
  values[name]=JSON.parse(bytes);
 }
 assert.deepEqual(values['proposed-anchor.json'].requiredProfile,values['proposed-descriptor.json'].requiredProfile);
 assert.equal(values['ENROLLMENT.json'].received,false);
 return values['proposed-anchor.json'];
}

export function writeMeasuredProposalFixture(root,dir,{sourceSha256,hostSha256}) {
 const client='vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs';
 const built=buildUnreceivedPair({clientBytes:readFileSync(join(root,client)),
  source:{repository:'epistemedeus/samedaydesk',commit:'e54f91e9d93f02cde6d2b281f0cc9b29ea87dfd9',path:client},
  requiredProfile:{money:'unfunded',participation:'voluntary-artifact-v1',sourceSha256,hostSha256},
  descriptorRepository:'epistemedeus/samedaydesk',descriptorCommit:'unreceived',
  descriptorPath:`${CURRENT_PROPOSAL_DIR}/proposed-descriptor.json`});
 mkdirSync(dir,{recursive:true});
 const anchorPath=join(dir,'proposed-anchor.json'),descriptorPath=join(dir,'proposed-descriptor.json');
 writeFileSync(anchorPath,built.anchorBytes);writeFileSync(descriptorPath,built.descriptorBytes);
 return {...built,anchorPath,descriptorPath};
}
// A pending-state negative uses a named fixture, not absence from a live registry.
export function copyCatalogWithoutProfile(from,into,profile){
 mkdirSync(into,{recursive:false});
 const index=readIndex(readFileSync(join(from,'index.json'),'utf8'));
 const packets=index.packets.filter(row=>row.sourceSha256!==profile.sourceSha256||row.hostSha256!==profile.hostSha256);
 for(const row of packets){const name=catalogFileName(row.sourceSha256,row.hostSha256);copyFileSync(join(from,name),join(into,name));}
 writeFileSync(join(into,'index.json'),JSON.stringify({schema:index.schema,packets},null,2)+'\n');
 return into;
}
