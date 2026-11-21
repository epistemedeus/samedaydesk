// Fixed expected atomic-unit examples over both exact sources. No rail effect.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const [base,candidate,out]=process.argv.slice(2),receipts=[];
const cases=[['19','0','0','19'],['20','0','1','19'],['21','0','1','20'],['100001','0','5000','95001'],['100000','3','5000','94997']];
for(const root of [base,candidate]) {
 const {quoteEconomics,FEE_BPS,ROUNDING_PROFILE}=await import(pathToFileURL(path.join(root,'vendor/hosted-wallet-market/src/fee.mjs')));
 assert.equal(FEE_BPS,500);assert.equal(ROUNDING_PROFILE,'commerce-payments-v1.1.0-single-capture');
 const examples=cases.map(([gross,railCost,fee,net])=>{
  const result=quoteEconomics({gross,railCost});assert.equal(result.platformFeeAtomic,fee);assert.equal(result.contributorNetAtomic,net);
  assert.equal(result.feeBasis,'new_job_gross');return {gross,railCost,fee,net,result};
 });
 assert.throws(()=>quoteEconomics({gross:'20',railCost:'0',captures:['10','10']}),/unsupported_partial_capture/);
 receipts.push({root,examples,partialCaptureRefused:true});
}
assert.deepEqual(receipts[0].examples,receipts[1].examples);
await writeFile(path.join(out,'financial-contract.json'),JSON.stringify({schema:'root4550.financial-contract.v1',receipts,equal:true,synthetic:true,networkArithmetic:'none; examples use atomic units of one asset only'},null,2)+'\n');
console.log(JSON.stringify({passed:true,examplesPerSource:cases.length,rounding:'integer floor per single capture',effects:false}));
