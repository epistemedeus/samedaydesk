import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';

/** Verify the complete committed closure before import/serving. No symlinks or unlisted files. */
export async function verifyContributorArtifact(root,schema,expectedCommit){
  const manifest=JSON.parse(await readFile(path.join(root,'SOURCE.json'),'utf8'));
  if(manifest.schema!==schema || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
      expectedCommit && manifest.sourceCommit!==expectedCommit || !Array.isArray(manifest.files) || manifest.files.length>3000)throw new Error('artifact identity refused');
  const expected=new Set(['SOURCE.json']);
  for(const entry of manifest.files){
    if(typeof entry.path!=='string'||entry.path.startsWith('/')||entry.path.includes('\\')||entry.path.split('/').some(part=>!part||part==='.'||part==='..')||
        expected.has(entry.path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||! /^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('artifact manifest refused');
    expected.add(entry.path);
    const file=path.join(root,entry.path),stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes)throw new Error('artifact bytes refused');
    const bytes=await readFile(file);
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('artifact digest refused');
  }
  async function scan(directory){
    for(const item of await readdir(directory,{withFileTypes:true})){
      const file=path.join(directory,item.name);
      if(item.isDirectory())await scan(file);
      else if(!item.isFile()||!expected.delete(path.relative(root,file)))throw new Error('unlisted artifact member refused');
    }
  }
  await scan(root);
  if(expected.size)throw new Error('missing artifact member');
  return manifest;
}

export async function verifyContributorRuntime(root,expectedCommit){
  const manifest=await verifyContributorArtifact(root,'neomorphic.contributor-journey.artifact.v1',expectedCommit);
  const stamp=JSON.parse(await readFile(path.join(root,'services/contributor-journey/dist/runtime/SOURCE-BUILD.json'),'utf8'));
  if(stamp.dirty!==false||stamp.sourceCommit!==manifest.sourceCommit||manifest.entry!=='services/contributor-journey/dist/index.js')throw new Error('runtime source stamp refused');
  const sds=path.resolve(root,'../..');
  if(createHash('sha256').update(await readFile(path.join(sds,'package-lock.json'))).digest('hex')!==manifest.hostLockSha256)throw new Error('host lock differs');
  const require=createRequire(path.join(sds,'package.json'));
  for(const [name,version] of Object.entries(manifest.requiredDependencies))if(require(name+'/package.json').version!==version)throw new Error('host dependency differs');
  return manifest;
}
