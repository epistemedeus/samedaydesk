import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const owner=resolve(process.argv[2]),out=resolve(process.argv[3]);
const {loadPublicAcquisition,inventoryArchive}=await import(pathToFileURL(join(owner,'public-acquisition/engine.mjs')));
const pub=loadPublicAcquisition({manifestPath:join(owner,'public-acquisition/manifest.json'),bytesRoot:join(owner,'public-acquisition/bytes')});
const manifest=JSON.parse(readFileSync(join(owner,'public-acquisition/manifest.json')));
const asset=manifest.assets.find(a=>a.id==='seller-repair-external-consumer'&&a.version==='0.4.1');
assert.ok(asset);assert.equal(asset.bytes,40891);assert.equal(asset.sha256,'64dbe1ee7f69dd40ebf71741eed92f1f3f893c44af8eadf18b71c0fac82227b8');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function get(url){const u=new URL(url);assert.ok(['neomorphic.io','agents.samedaydesk.com'].includes(u.hostname));const started=Date.now();const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const chunks=[];let total=0;for await(const c of r.body){total+=c.length;assert.ok(total<=asset.bytes);chunks.push(c)}const bytes=Buffer.concat(chunks);assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);assert.deepEqual(bytes,pub.files.get(asset.relativePath).bytes);return{bytes,receipt:{url,status:r.status,bytes:total,sha256:sha(bytes),milliseconds:Date.now()-started}}}
const original=await get(asset.originalUrl);
const mirror=await get('https://agents.samedaydesk.com/.well-known/public-acquisition/assets/'+asset.relativePath);
const members=inventoryArchive(original.bytes);assert.equal(members.length,asset.inventory.memberCount);
const root=mkdtempSync(join(tmpdir(),'root-seller041-receiving-')),tgz=join(root,'received.tar.gz');
writeFileSync(tgz,original.bytes);
const ext=spawnSync('tar',['-xzf',tgz,'-C',root],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(ext.status,0,ext.stderr);
const c=JSON.parse(readFileSync(join(owner,'public-acquisition/cold-commands.json'))).commands.find(a=>a.id===asset.id&&a.version===asset.version);assert.ok(c);
const steps=[];for(const s of c.steps){const r=spawnSync(s.argv[0],s.argv.slice(1),{cwd:join(root,c.cwd),env:{PATH:process.env.PATH},encoding:'utf8',timeout:25000,maxBuffer:131072});assert.equal(r.status,0,r.stderr||r.stdout);for(const text of s.stdoutIncludes)assert.ok(r.stdout.includes(text),text);steps.push({status:r.status,stdout:r.stdout.trim(),stderr:r.stderr,milliseconds:r.duration})}
const receipt={at:new Date().toISOString(),source:'015f07d5a75d02a4e74709b17b2b1176501e92a5',original:original.receipt,mirror:mirror.receipt,members:members.length,coldRoot:root,steps,actualAnonymousHostedAcquisition:true,ownerLoopbackUsefulReceiving:true,actualCustomerUse:false,paymentSent:false};
writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
