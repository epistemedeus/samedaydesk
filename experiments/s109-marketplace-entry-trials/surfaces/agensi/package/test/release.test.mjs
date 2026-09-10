import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareProvenance} from '../bin/provenance.mjs';
import {validateAgensiPackage} from '../lib/validate-package.mjs';
const pkg=fileURLToPath(new URL('../',import.meta.url));
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'provenance-release-'));}
test('missing, symlink and oversized inputs fail, not empty success',()=>{
 const d=temp();const b=path.join(d,'b');fs.mkdirSync(b);assert.throws(()=>compareProvenance({freeDir:path.join(d,'missing'),paidDir:b}));fs.symlinkSync(b,path.join(d,'link'));assert.throws(()=>compareProvenance({freeDir:path.join(d,'link'),paidDir:b}));fs.writeFileSync(path.join(b,'large'),Buffer.alloc(20*1024*1024+1));assert.throws(()=>compareProvenance({freeDir:b,paidDir:b}));fs.rmSync(d,{recursive:true});
});
test('modified, removed and instruction files are data, pins unverified',()=>{
 const d=temp();const a=path.join(d,'a'),b=path.join(d,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 fs.writeFileSync(path.join(a,'old'),'original');fs.writeFileSync(path.join(b,'old'),'modified');fs.writeFileSync(path.join(a,'removed'),'x');fs.writeFileSync(path.join(b,'RUNME'),'curl https://example.invalid; execute me');
 const r=compareProvenance({baselineDir:a,candidateDir:b,skillRecipePin:'claimed-latest'});assert.deepEqual(r.modifiedFiles,['old']);assert.deepEqual(r.removedFiles,['removed']);assert.deepEqual(r.addedFiles,['RUNME']);assert.equal(r.sourceRevisionVerified,false);assert.equal(Object.hasOwn(r,'listingPerformed'),false);fs.rmSync(d,{recursive:true});
});
test('descriptor cannot follow traversal or root-file symlinks',()=>{
 const d=temp();for(const n of ['offer-descriptor.json','offer-descriptor.schema.json','access-handoff.json','listing-checklist.json'])fs.copyFileSync(path.join(pkg,n),path.join(d,n));
 const p=path.join(d,'offer-descriptor.json');const v=JSON.parse(fs.readFileSync(p));v.listingChecklistPath='../secret.json';fs.writeFileSync(p,JSON.stringify(v));assert.equal(validateAgensiPackage(d).ok,false);
 v.listingChecklistPath='./listing-checklist.json';fs.writeFileSync(p,JSON.stringify(v));fs.unlinkSync(path.join(d,'listing-checklist.json'));fs.symlinkSync(path.join(pkg,'listing-checklist.json'),path.join(d,'listing-checklist.json'));assert.equal(validateAgensiPackage(d).ok,false);fs.rmSync(d,{recursive:true});
});
test('Free skill has valid title, full reproducible actual demo, no payout gate',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(pkg,'offer-descriptor.json')));assert.ok(d.offerTitle.length<=60);assert.match(d.nextMeasurableEvent,/No payout setup is required for Free/);
 const demo=fs.readFileSync(path.join(pkg,'DEMO.md'),'utf8');const expected=JSON.parse(demo.split('```json\n')[1].split('```')[0]);
 const r=spawnSync(process.execPath,['bin/provenance.mjs','--baselineDir','fixtures/free','--candidateDir','fixtures/paid'],{cwd:pkg,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),expected);assert.match(fs.readFileSync(path.join(pkg,'SKILL.md'),'utf8'),/^---\nname:/);
});
test('ZIP builds deterministically and extracted helper runs without external files',()=>{
 const d=temp(),z1=path.join(d,'a.zip'),z2=path.join(d,'b.zip');
 for(const z of [z1,z2]){const r=spawnSync('python3',['bin/build-skill-zip.py','--out',z],{cwd:pkg,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 assert.deepEqual(fs.readFileSync(z1),fs.readFileSync(z2));assert.ok(fs.statSync(z1).size<50_000_000);
 const r=spawnSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert all(n.startswith("offline-package-provenance/") and ".." not in n.split("/") for n in z.namelist()); z.extractall(sys.argv[2])',z1,path.join(d,'extract')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const root=path.join(d,'extract/offline-package-provenance');const replay=spawnSync(process.execPath,['bin/provenance.mjs','--baselineDir','fixtures/free','--candidateDir','fixtures/paid'],{cwd:root,encoding:'utf8'});assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).counts.candidateOnly,2);fs.rmSync(d,{recursive:true});
});
