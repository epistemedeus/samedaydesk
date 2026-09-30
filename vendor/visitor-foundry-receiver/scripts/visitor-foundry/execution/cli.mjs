#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { packageModule, bindingFor } from './example/package.mjs';
import { invoke, installation } from './src/supervisor.mjs';
import { CAPS } from './src/contracts.mjs';
function read(path, limit) {
  if (statSync(path).size > limit) throw new Error('file limit'); return readFileSync(path);
}
const [command,...args]=process.argv.slice(2);
try {
  if(command==='runtime') console.log(JSON.stringify(installation(),null,2));
  else if(command==='package') {
    const [modulePath,outputPath,sourceRevision]=args;
    if(!modulePath||!outputPath||!sourceRevision) throw new Error('package MODULE.wasm ARTIFACT.json FULL_SOURCE_REVISION');
    const artifact=packageModule(read(modulePath,CAPS.moduleBytes),{sourceRevision});
    writeFileSync(outputPath,JSON.stringify(artifact,null,2)+'\n'); console.log(JSON.stringify({artifactId:artifact.id,module:artifact.module}));
  } else if(command==='invoke') {
    const [artifactPath,modulePath,inputPath]=args;
    if(!inputPath) throw new Error('invoke ARTIFACT.json MODULE.wasm INPUT.json');
    const artifact=JSON.parse(read(artifactPath,65536));
    const input=artifact.input.encoding==='json'?JSON.parse(read(inputPath,CAPS.inputBytes)):read(inputPath,CAPS.inputBytes);
    const r=await invoke({artifact,moduleBytes:read(modulePath,CAPS.moduleBytes),input,binding:bindingFor(artifact)});
    console.log(JSON.stringify({cliPid:process.pid,purpose:'owner_qa',...r}));
    if(r.observation.status!=='ok') process.exitCode=1;
  } else throw new Error('Use runtime, package, or invoke. CLI is owner QA, not receiver authority.');
} catch(error) {console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
