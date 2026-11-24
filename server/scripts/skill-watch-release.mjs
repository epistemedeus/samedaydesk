// Finite operator consumer. Check a published release, scan only regular blobs
// from its immutable tree, and deliver through the existing paid period/mail owner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { mkdir,mkdtemp,open,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname,join,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openCareStore } from "../lib/care-store.js";

export const scannerDigest="0db78baedbf2b475d8cf762608e5bcee12b05e53a93e8e8b29b58d6f1af6f79f";
const maxBlobBytes=8*1024*1024;
export const gitShaPattern=/^[a-f0-9]{40}$/;
export const validTag=tag=>typeof tag==="string" && tag.length<=160 && tag.split("/").every(part=>
  part && ![".",".."].includes(part) && !/[\\\x00-\x20\x7f]/.test(part));
export function githubRepository(repository) {
  const match=/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(repository);
  return match && !match.slice(1).some(p=>p==="." || p==="..") ? match.slice(1).join("/") : null;
}
const git=(dir,args,limit=2**20)=>execFileSync("git",["--no-replace-objects","-C",dir,...args],
  {maxBuffer:limit,timeout:20000,stdio:["ignore","pipe","pipe"]});
async function readJson(url) {
  const response=await fetch(url,{credentials:"omit",redirect:"error",signal:AbortSignal.timeout(15000)});
  assert(response.status===200,"release source unavailable");
  let bytes=0;const chunks=[];
  for await(const chunk of response.body) {bytes+=chunk.length;assert(bytes<=1024*1024,"release response too large");chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks));
}
export async function receivePublishedRelease({repository,tag,checkout,scanner,store,read=readJson}) {
  const repo=githubRepository(repository);
  assert(repo && validTag(tag),"expected a public GitHub release repository and tag");
  const base="https://api.github.com/repos/"+repo;
  const [release,resolved]=await Promise.all([read(base+"/releases/tags/"+encodeURIComponent(tag)),read(base+"/commits/"+encodeURIComponent(tag))]);
  const commit=resolved.sha;
  assert(release.tag_name===tag && release.draft===false && release.published_at && gitShaPattern.test(commit),"published release required");
  assert(git(checkout,["remote","get-url","origin"]).toString().trim().replace(/\.git\/?$/,"")===repository,"repository checkout differs");
  assert(git(checkout,["rev-parse","--verify","refs/tags/"+tag+"^{commit}"]).toString().trim()===commit,"local and upstream release differ");
  const source=await readPinnedScanner(scanner);
  const entries=git(checkout,["ls-tree","-zrl",commit],4*1024*1024).toString("utf8").split("\0").filter(Boolean).map(entry=>{
    const match=/^(\d+) (\w+) ([a-f0-9]{40})\s+([0-9-]+)\t(.+)$/u.exec(entry);
    assert(match,"invalid release member");
    return {mode:match[1],type:match[2],sha:match[3],size:Number(match[4]),path:match[5]};
  });
  const report=await scanRelease({source,entries,readBlob:({sha,size})=>git(checkout,["cat-file","blob",sha],size+1024)});
  return store.watch.observeRelease({repository,commit,publishedAt:release.published_at,report});
}

export async function readPinnedScanner(path) {
  const file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat=await file.stat();
    assert(stat.isFile() && stat.size>0 && stat.size<=64*1024,"invalid scanner file");
    const bytes=Buffer.alloc(stat.size+1);
    const {bytesRead}=await file.read(bytes,0,bytes.length,0);
    const source=bytes.subarray(0,bytesRead);
    assert(createHash("sha256").update(source).digest("hex")===scannerDigest,"original scanner source differs");
    return source;
  } finally {await file.close();}
}

export function validateReleaseTree(entries) {
  assert(Array.isArray(entries) && entries.length<=5000,"release exceeds bounded static worker");
  let total=0;
  const paths=new Map();
  for(const {mode,type,sha,size,path} of entries) {
    const directory=mode==="040000" && type==="tree";
    assert(directory || ["100644","100755"].includes(mode) && type==="blob","non-regular release member requires operator review");
    assert(gitShaPattern.test(sha) && typeof path==="string" && path.length<=1024 && !paths.has(path) && path.split("/").every(p=>
      p && !["..",".",".git"].includes(p.toLowerCase()) && !/[\\\x00-\x1f\x7f]/.test(p)),"release requires operator review");
    paths.set(path,directory);
    if(directory)continue;
    assert(Number.isInteger(size) && size>=0 && size<=maxBlobBytes,"release member exceeds byte limit");
    total+=size;
    assert(total<=48*1024*1024,"release exceeds static snapshot byte limit");
  }
  for(const path of paths.keys()) {
    let parent=dirname(path);
    while(parent!==".") {assert(paths.get(parent)!==false,"release path conflicts");parent=dirname(parent);}
  }
  return entries.filter(entry=>entry.type==="blob");
}

export async function scanRelease({source,entries,readBlob}) {
  const files=validateReleaseTree(entries);
  const work=await mkdtemp(join(tmpdir(),"sds-paid-watch-"));
  try {
    // Import exactly the reviewed module bytes; the scanner has only built-in dependencies.
    const moduleFile=join(work,"scanner.mjs");
    await writeFile(moduleFile,source,{flag:"wx",mode:0o600});
    const {analyze}=await import(pathToFileURL(moduleFile));
    const snapshot=join(work,"release");await mkdir(snapshot);
    for(const entry of files) {
      const bytes=await readBlob(entry);
      assert(Buffer.isBuffer(bytes) && bytes.length===entry.size &&
        createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")===entry.sha,"release blob differs");
      const file=join(snapshot,entry.path);await mkdir(dirname(file),{recursive:true,mode:0o700});
      await writeFile(file,bytes,{flag:"wx",mode:0o600});
    }
    const scan=analyze(snapshot);
    const rules=[...new Set(scan.findings.map(f=>`${f.sev} ${f.rule} ${f.file}`))].sort();
    return {verdict:scan.verdict,scanned:scan.scanned,rules};
  } finally {await rm(work,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [repository,tag,checkout,scanner]=process.argv.slice(2),store=openCareStore();
  try {console.log(JSON.stringify(await receivePublishedRelease({repository,tag,checkout,scanner,store})));}
  finally {await store.close();}
}
