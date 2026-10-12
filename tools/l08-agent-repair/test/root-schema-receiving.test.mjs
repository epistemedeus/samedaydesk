import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseCallerContract,CALLER_PIN} from '../lib/caller-readiness.mjs';
import {PRICE_PATTERN} from '../lib/readiness-contract.mjs';
const input=()=>({method:'GET',path:'/estimate',schema:{type:'object',required:['data'],properties:{data:{type:'object',required:['quote'],properties:{quote:{type:'string',pattern:PRICE_PATTERN.source}}}}},value:{data:{quote:'4.50'}},semantic:{pointer:'data.quote',pattern:PRICE_PATTERN.source},pin:CALLER_PIN,deadline:'2099-01-01T00:00:00.000Z'});
test('all root and nested required keys are actual sample constraints',()=>{
  let x=input();x.schema.required.push('customer');assert.equal(diagnoseCallerContract(x).nextAction,'required_missing:customer');
  x.value.customer='supplied';assert.equal(diagnoseCallerContract(x).nextAction,'decimal_match');
  x=input();x.schema.properties.data.required.push('currency');assert.equal(diagnoseCallerContract(x).nextAction,'required_missing:data.currency');
  x.value.data.currency='USD';assert.equal(diagnoseCallerContract(x).nextAction,'decimal_match');
});
test('unhandled sibling constraints do not masquerade as a schema pass',()=>{
  for(const [nested,rule] of [[false,{type:'number'}],[false,{const:42}],[true,{pattern:'^[A-Z]+$'}],[true,{type:'array',items:{type:'number'}}]]){
    const x=input(),node=nested?x.schema.properties.data:x.schema;node.properties.sibling=rule;
    const out=diagnoseCallerContract(x);assert.equal(out.fit,'no_fit');assert.equal(out.schema.state,'not_invoked');assert.equal(out.nextAction,'schema_unsupported:sibling:'+(nested?'data.':'')+'sibling');
    for(const key of ['paymentSent','repairPosted','routeFetched','quoteGenerated','completedUserTask'])assert.equal(out[key],false);
  }
});
test('unconstrained and annotation-only siblings remain useful plain inputs',()=>{
  const x=input();x.schema.properties.customer={description:'Caller context'};x.schema.properties.data.properties.currency={};
  x.value.customer={supplied:true};x.value.data.currency='USD';assert.equal(diagnoseCallerContract(x).nextAction,'decimal_match');
  x.schema.properties.customer=false;assert.equal(diagnoseCallerContract(x).nextAction,'schema_malformed');
});
