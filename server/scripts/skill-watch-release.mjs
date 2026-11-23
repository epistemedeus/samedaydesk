// Finite operator consumer. Check a published release, scan only regular blobs
// from its immutable tree, and deliver through the existing paid period/mail owner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir,mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname,join,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openCareStore } from "../lib/care-store.js";

const scannerDigest="0db78baedbf2b475d8cf762608e5bcee12b05e53a93e8e8b29b58d6f1af6f79f";
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
  const match=/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(repository);
  assert(match && ![match[1],match[2]].some(p=>p==="." || p==="..") && typeof tag==="string" && tag.length<=160 &&
    !/[\x00-\x1f]/.test(tag),"expected a public GitHub release repository and tag");
  const base="https://api.github.com/repos/"+match[1]+"/"+match[2];
  const [release,resolved]=await Promise.all([read(base+"/releases/tags/"+encodeURIComponent(tag)),read(base+"/commits/"+encodeURIComponent(tag))]);
  const commit=resolved.sha;
  assert(release.tag_name===tag && release.draft===false && release.published_at && /^[a-f0-9]{40}$/.test(commit),"published release required");
  assert(git(checkout,["remote","get-url","origin"]).toString().trim().replace(/\.git\/?$/,"")===repository,"repository checkout differs");
  assert(git(checkout,["rev-parse","--verify","refs/tags/"+tag+"^{commit}"]).toString().trim()===commit,"local and upstream release differ");
  const source=await readFile(scanner);
  assert(createHash("sha256").update(source).digest("hex")===scannerDigest,"original scanner source differs");
  const work=await mkdtemp(join(tmpdir(),"sds-paid-watch-"));
  try {
    // Import exactly the reviewed module bytes; the scanner has only built-in dependencies.
    const moduleFile=join(work,"scanner.mjs");
    await writeFile(moduleFile,source,{flag:"wx",mode:0o600});
    const {analyze}=await import(pathToFileURL(moduleFile));
    const snapshot=join(work,"release");await mkdir(snapshot);
    let total=0;
    const entries=git(checkout,["ls-tree","-zrl",commit],4*1024*1024).toString("utf8").split("\0").filter(Boolean);
    assert(entries.length<=5000,"release exceeds bounded static worker");
    for(const entry of entries) {
      const m=/^(\d+) (\w+) ([a-f0-9]{40})\s+([0-9-]+)\t(.+)$/u.exec(entry);
      assert(m && ["100644","100755"].includes(m[1]) && m[2]==="blob","non-regular release member requires operator review");
      const size=Number(m[4]);total+=size;
      const parts=m[5].split("/");
      assert(size<=8*1024*1024 && total<=48*1024*1024 && parts.every(p=>p && !["..",".",".git"].includes(p) &&
        !/[\\\x00-\x1f]/.test(p)),"release requires operator review");
      const file=join(snapshot,...parts);await mkdir(dirname(file),{recursive:true,mode:0o700});
      const bytes=git(checkout,["cat-file","blob",m[3]],size+1024);
      assert(bytes.length===size);await writeFile(file,bytes,{flag:"wx",mode:0o600});
    }
    const scan=analyze(snapshot);
    const rules=[...new Set(scan.findings.map(f=>String(f.sev)+" "+String(f.rule)+" "+String(f.file)))].sort();
    return store.watch.observeRelease({repository,commit,publishedAt:release.published_at,report:{verdict:scan.verdict,scanned:scan.scanned,rules}});
  } finally {await rm(work,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [repository,tag,checkout,scanner]=process.argv.slice(2),store=openCareStore();
  try {console.log(JSON.stringify(await receivePublishedRelease({repository,tag,checkout,scanner,store})));}
  finally {await store.close();}
}
