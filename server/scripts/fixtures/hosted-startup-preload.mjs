import { Server } from "node:http";
const original = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send?.({ port: this.address().port }));
  return original.apply(this, args);
};

// Explicit fixture-only race, after canonical admission/preflight and before the
// sealed launch. Never loaded by ordinary server startup or a managed build.
if(process.env.SDS_FIXTURE_INVOCATION_RACE_FILE){
 const {readFile,unlink,chmod}=await import('node:fs/promises');
 const {IntegrationStore}=await import('../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/store.mjs');
 const {python}=await import('../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs');
 IntegrationStore.prototype.onInvocationReserved=async execution=>{
  let armed;try{armed=JSON.parse(await readFile(process.env.SDS_FIXTURE_INVOCATION_RACE_FILE,'utf8'));}catch{return;}
  if(armed.requestDigest===execution.requestId){await unlink(process.env.SDS_FIXTURE_INVOCATION_RACE_FILE);await chmod(python,0o644);}
 };
}
