// Build-time packaging only. The sealed execution loader/launcher is unchanged.
import {lstat,readdir,open,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {hash} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/index.mjs';
export const LAYOUT='self-contained-regular-v1';
export const MANIFEST='runtime-layout.json';
export const coded=code=>Object.assign(new Error(code),{code});
const bytesHash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
async function boundedBytes(file,limit) {
 const fd=await open(file,'r');try{
  const s=await fd.stat();if(!s.isFile()||s.size<1||s.size>limit)throw coded('runtime_layout_invalid');
  const bytes=Buffer.alloc(s.size+1),{bytesRead}=await fd.read(bytes,0,bytes.length,0);
  if(bytesRead!==s.size)throw coded('runtime_layout_invalid');return bytes.subarray(0,bytesRead);
 }finally{await fd.close();}
}
async function small(file,limit) {
 if(!(await lstat(file)).isFile())throw coded('runtime_layout_invalid');return boundedBytes(file,limit);
}
// This is the exact interpreter/binding/native subset of installation().pins.
// Source/launcher/profile/node pins are unaffected by representation changes.
export async function runtimeContentIdentity(root) {
 const cfg=(await boundedBytes(path.join(root,'pyvenv.cfg'),4096)).toString('utf8'),version=cfg.match(/^version = (\d+\.\d+)\./m)?.[1];
 if(!version)throw coded('runtime_layout_invalid');
 const binding=path.join(root,`lib/python${version}/site-packages/wasmtime`);
 const files=(await readdir(binding,{recursive:true})).filter(f=>f.endsWith('.py')).sort();
 if(files.length<1||files.length>1024)throw coded('runtime_layout_invalid');
 const records=[];for(const file of files)records.push({path:file,digest:bytesHash(await boundedBytes(path.join(binding,file),1024*1024))});
 return {python:bytesHash(await boundedBytes(path.join(root,'bin/python'),64*1024*1024)),binding:hash(records),
  native:bytesHash(await boundedBytes(path.join(binding,'linux-x86_64/_libwasmtime.so'),64*1024*1024))};
}
export async function auditOfflineTree(root) {
 const top=await lstat(root);if(!top.isDirectory()||top.isSymbolicLink())throw coded('runtime_layout_invalid');
 const queue=[root];let files=0,bytes=0;
 while(queue.length){
  const dir=queue.pop();for(const item of await readdir(dir,{withFileTypes:true})){
   if(++files>12000)throw coded('runtime_layout_capacity');
   const file=path.join(dir,item.name),s=await lstat(file);
   if(s.isSymbolicLink())throw coded('runtime_layout_link');
   if(s.isDirectory())queue.push(file);else if(s.isFile()){bytes+=s.size;if(bytes>256*1024*1024)throw coded('runtime_layout_capacity');}
   else throw coded('runtime_layout_invalid');
  }
 }
 const cfg=(await small(path.join(root,'pyvenv.cfg'),4096)).toString('utf8');
 if(cfg!=='include-system-site-packages = false\nversion = 3.12.15\n')throw coded('runtime_layout_invalid');
 return {files,bytes};
}
export async function sealOfflineRuntime(root,{archiveSha256,wheelSha256}) {
 const content=await runtimeContentIdentity(root);
 const record={schema:'sds.foundry.runtime-layout.v1',layout:LAYOUT,archiveSha256,wheelSha256,content};
 await writeFile(path.join(root,MANIFEST),JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});
 await publishRuntimeModes(root);return record;
}
// Only a verified build candidate is mutable. These are public runtime bytes,
// never private inputs. No write permission is granted to another uid/gid.
const executables=new Set(['bin/python','bin/python3','bin/python3.12']);
async function runtimeModes(root,receive=false){
 await auditOfflineTree(root);
 const queue=[root];while(queue.length){const dir=queue.pop(),items=await readdir(dir);
  for(const item of items){const file=path.join(dir,item),s=await lstat(file),relative=path.relative(root,file);
   const mode=s.isDirectory()?0o755:executables.has(relative)?0o755:0o644;
   if(receive)await chmod(file,mode);else if((s.mode&0o7777)!==mode)throw coded('runtime_publication_modes');
   if(s.isDirectory())queue.push(file);
  }
 }
 if(receive)await chmod(root,0o755);else if(((await lstat(root)).mode&0o7777)!==0o755)throw coded('runtime_publication_modes');
}
export const publishRuntimeModes=root=>runtimeModes(root,true);
export const verifyRuntimeModes=root=>runtimeModes(root);
export async function verifyOfflineRuntime(root,{archiveSha256,wheelSha256}) {
 await auditOfflineTree(root);
 let record;try{record=JSON.parse((await small(path.join(root,MANIFEST),4096)).toString('utf8'));}catch{throw coded('runtime_layout_manifest');}
 const content=await runtimeContentIdentity(root),expected={schema:'sds.foundry.runtime-layout.v1',layout:LAYOUT,archiveSha256,wheelSha256,content};
 if(hash(record)!==hash(expected))throw coded('runtime_content_changed');
 await verifyRuntimeModes(root);
 return {layout:LAYOUT,deployable:true};
}
