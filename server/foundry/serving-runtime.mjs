// Once per normal HTTP mount, after publication and before foundry readiness.
// No installation, child execution, authority renewal, SQL or private input writes.
import {constants} from 'node:fs';
import {open,lstat,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyOfflineContent,MANIFEST,coded} from './runtime-layout.mjs';
import {CPYTHON_SHA256,WHEEL_SHA256} from './runtime-artifacts.mjs';

// Independently received outputs of the checksum-pinned archive and wheel.
// This is publication integrity, not a replacement for installedPolicy/verification.
export const PUBLICATION_CONTENT=Object.freeze({
 python:'sha256:0886fb76ceec8ff568d23079b5da6342bb41675e216e11525d4d6a9e65988d10',
 binding:'sha256:908e397c5235a35788d6783e2a2fb7f0bfe554eca5d2a05de500253d0a450905',
 native:'sha256:9594714d3c73c3087ab3d42d9614cf72973b25c181b8625ffcc46a8a75972d7e',
});
const execution=fileURLToPath(new URL('../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/',import.meta.url));
const aliases=['python','python3','python3.12'];
const errno=new Set(['EACCES','EPERM','EROFS','ENOENT','ENOTDIR','ELOOP','ERR_ACCESS_DENIED']);
const codes=new Set(['runtime_startup_identity','runtime_startup_mode','runtime_startup_changed','runtime_startup_deadline','runtime_startup_denied',
 'runtime_layout_invalid','runtime_layout_capacity','runtime_layout_link','runtime_layout_manifest','runtime_content_changed']);
export function servingRuntimeFailure(error){return {code:codes.has(error?.code)?error.code:'runtime_startup_denied',
 nativeCode:errno.has(error?.code)?error.code:null,resource:'runtime_publication'};}
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&a.gid===b.gid&&a.size===b.size;
const mode=s=>s.mode&0o7777;
const via=(fd,name)=>`/proc/self/fd/${fd.fd}/${name}`;
const flags=constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK;
async function digest(fd){
 const s=await fd.stat();if(!s.isFile()||s.size<1||s.size>64*1024*1024)throw coded('runtime_layout_invalid');
 const bytes=Buffer.alloc(s.size+1),{bytesRead}=await fd.read(bytes,0,bytes.length,0);
 if(bytesRead!==s.size)throw coded('runtime_startup_changed');
 return 'sha256:'+createHash('sha256').update(bytes.subarray(0,bytesRead)).digest('hex');
}
// root is internal to the SDS owner; normal serving always uses the fixed module
// location. The argument exists for disposable publication controls, never env/API.
export async function receiveServingRuntime(root=execution){
 const deadline=Date.now()+5000,check=()=>{if(Date.now()>deadline)throw coded('runtime_startup_deadline');};
 const runtime=path.join(root,'.runtime');
 // An explicitly installed legacy host venv remains read-only. It has no offline
 // publication certificate and can never acquire executable permissions here.
 try{await lstat(path.join(runtime,MANIFEST));}catch(e){if(e.code==='ENOENT')return {action:'legacy_read_only',changedExecutables:0};throw e;}
 if(process.platform!=='linux'||process.arch!=='x64')throw coded('runtime_layout_invalid');
 const handles=[],dirs=[],files=[];
 try{
  let parent;
  for(const [name,file]of [['execution',root],['runtime',path.join(runtime)],['bin',path.join(runtime,'bin')]]){
   const lookup=parent?via(parent,name==='runtime'?'.runtime':'bin'):file;
   const fd=await open(lookup,flags|constants.O_DIRECTORY);handles.push(fd);
   const stat=await fd.stat();if(!stat.isDirectory()||(stat.mode&0o022)!==0)throw coded('runtime_startup_identity');
   dirs.push({file,fd,stat});parent=fd;check();
  }
  // Resolve the audit through the opened runtime directory, not an unpinned
  // parent pathname. All internal links/types/size bounds are checked first.
  const anchored=via(dirs[0].fd,'.runtime');
  const content=await verifyOfflineContent(anchored,{archiveSha256:CPYTHON_SHA256,wheelSha256:WHEEL_SHA256});
  if(!isDeepStrictEqual(content,PUBLICATION_CONTENT))throw coded('runtime_content_changed');check();
  for(const name of aliases){
   const fd=await open(via(parent,name),flags);handles.push(fd);const stat=await fd.stat();
   if(!stat.isFile()||stat.nlink!==1)throw coded('runtime_startup_identity');
   if(![0o644,0o755].includes(mode(stat)))throw coded('runtime_startup_mode');
   if(await digest(fd)!==PUBLICATION_CONTENT.python)throw coded('runtime_content_changed');
   if(mode(stat)!==0o755&&stat.uid!==process.geteuid())throw coded('runtime_startup_identity');
   files.push({fd,stat,file:path.join(runtime,'bin',name)});check();
  }
  async function identities(){
   for(const x of [...dirs,...files]){if(!same(await x.fd.stat(),x.stat)||!same(await lstat(x.file),x.stat))throw coded('runtime_startup_changed');}check();
  }
  // Validate the complete allowlist before the first mutation. fchmod addresses
  // the verified inode, never a symlink or replacement pathname. No chown, write
  // permission expansion, directory/wheel/private-file chmod or recursive repair.
  await identities();let changedExecutables=0;
  for(const x of files){
   await identities();if(mode(await x.fd.stat())===0o644){
    if(await digest(x.fd)!==PUBLICATION_CONTENT.python)throw coded('runtime_startup_changed');check();
    await x.fd.chmod(0o755);changedExecutables++;
   }
   if(mode(await x.fd.stat())!==0o755)throw coded('runtime_startup_denied');
   await access(x.file,constants.R_OK|constants.X_OK);
  }
  await identities();return {action:changedExecutables?'received':'unchanged',changedExecutables};
 }finally{for(const fd of handles.reverse())await fd.close();}
}
