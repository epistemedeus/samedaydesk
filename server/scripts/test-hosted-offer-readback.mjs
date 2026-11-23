import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hostedLinks, readHostedTerms } from './hosted-offer-readback.mjs';

test('read-only legacy catalog binds each original link, price and interval and keeps missing terms visible',async()=>{
  const offers=JSON.parse(await readFile(new URL('../../release/offers.json',import.meta.url),'utf8')).notInHarnessYet;
  const objects=offers.map(o=>({id:'plink_'+o.id,url:'https://buy.stripe.com/'+hostedLinks[o.id],livemode:true,active:true,
    after_completion:{type:'hosted_confirmation'},custom_fields:[]}));
  const transport={paymentLinks:{list:async({starting_after})=>starting_after?{data:objects.slice(3,7),has_more:false}:
    {data:objects.slice(0,3),has_more:true},listLineItems:async id=>{
      const o=offers.find(o=>'plink_'+o.id===id);
      return {data:[{quantity:1,price:{id:'price_'+o.id,unit_amount:o.cents,currency:'usd',active:true,
        product:{id:'prod_'+o.id,name:o.id,active:true},recurring:o.interval?{interval:o.interval,interval_count:1}:null}}],has_more:false};
    }}};
  const result=await readHostedTerms(transport,offers);
  assert.equal(Object.keys(result.items).length,7);assert.deepEqual(result.missing,[offers[7].id]);
  assert.equal(result.items.legacy_skill_watch.interval,'month');
  await assert.rejects(readHostedTerms(transport,offers.map(o=>({...o,cents:o.cents+1}))),/price or billing interval/);
});
