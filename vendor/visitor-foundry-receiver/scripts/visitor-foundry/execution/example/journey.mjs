import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createReceivingPorts, installedPolicy, compareExpected, toVF03Receipt } from '../src/ports.mjs';
import { cases, evaluation, bindingFor } from './package.mjs';
import { hash, refOf, bytesHash } from '../src/contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)), work=`${root}.build`;
mkdirSync(work,{recursive:true});
const sourceHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
function cli(args) {
  const r=spawnSync(process.execPath,[`${root}cli.mjs`,...args],{encoding:'utf8',maxBuffer:1048576});
  if(r.status!==0) throw new Error(r.stderr || r.stdout);return JSON.parse(r.stdout);
}
// A packages a newly compiled implementation, not an installed host recipe.
const packaged=cli(['package',`${work}/structured-result.wasm`,`${work}/artifact.json`,sourceHead]);
const artifact=JSON.parse(readFileSync(`${work}/artifact.json`));
const moduleBytes=readFileSync(`${work}/structured-result.wasm`);
const policy=installedPolicy({evaluator:evaluation,cases,environment:{platform:'linux',arch:'x64',purpose:'owner_qa'}});
const assignment={id:'assignment:journey-1',candidateId:'candidate:journey-a',capability:{id:artifact.capability.capabilityId,revision:artifact.capability.contentId},
  sourceRevision:hash(artifact.capability.source),artifactDigest:artifact.id,dependencyDigest:hash([]),
  evaluator:{id:evaluation.id,revision:evaluation.revision},environmentDigest:policy.environmentDigest,
  requiredChecks:cases.map(c=>c.id),deadline:new Date(Date.now()+60000).toISOString(),reservation:{cpuMs:12000,wallMs:24000,memoryMb:512}};
const fence='owned-assignment-fence-1';
const ports=createReceivingPorts({enabled:true,policy,loadVerification:async()=>({artifact,moduleBytes,assignment,fence})});
const verifyStart=performance.now();const verification=await ports.verify({projectId:'project:qa',assignmentId:assignment.id,fence});
if(verification.outcome!=='sample_checks_passed') throw new Error(JSON.stringify(verification));
const verifierWallMs=performance.now()-verifyStart;
const receipt=toVF03Receipt(verification,{assignment,fence,observedAt:new Date().toISOString()});
// B has only a packaged artifact, exact module and its own task. Each is a new Node
// process plus a new Wasmtime child. No transcript, guest state or process cache.
const cold=[];
for(const c of cases) {
  const path=`${work}/cold-input.json`;writeFileSync(path,JSON.stringify(c.input));
  const start=performance.now();const result=cli(['invoke',`${work}/artifact.json`,`${work}/structured-result.wasm`,path]);
  cold.push({caseId:c.id,taskId:`task:b:${c.id}`,cliPid:result.cliPid,output:result.output,
    expectedMatch:compareExpected(result.output,c.expected),endToEndWallMs:performance.now()-start,observation:result.observation});
}
const faulty=cases.map(()=>({outcome:'observed',payload:{accepted:true}}));
const matrix=[['independent-exact-output',compareExpected],['always-pass',()=>true],['always-fail',()=>false]].map(([evaluator,fn])=>({
  evaluator,goodAccepted:cases.filter((c,i)=>fn(cold[i].output,c.expected)).length,
  faultyAccepted:cases.filter((c,i)=>fn(faulty[i],c.expected)).length,denominator:cases.length}));
const record={schema:'neomorphic.foundry.portable-execution.owner-qa-journey.v1',sourceHead,
  machine:{hostname:execFileSync('hostname',[],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch},
  build:JSON.parse(readFileSync(`${work}/build.json`)),artifact,packaged,verification,receipt,verifierWallMs,cold,evaluatorControls:matrix,
  relationship:'owner',purpose:'owner_qa',independence:'not_established',commercialUplift:null,tokenSavings:null,
  limitations:['Owner-controlled packaging and later-process reuse, not durable VF04A discovery/admission.',
    'Missing implementation is the portable compact/status-preserving adapter; existing MCP production wrappers remain unchanged.',
    'Expected unsupported/unknown outputs are correct behavior, not successful external tasks. Costs and sharing effort unknown.']};
writeFileSync(`${root}evidence/journey.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({sourceHead,artifactId:artifact.id,verification:verification.outcome,coldCases:cold.length,
  coldMatched:cold.filter(c=>c.expectedMatch).length,verifierWallMs,evaluatorControls:matrix}));
