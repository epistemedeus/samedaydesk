import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createSdsApp } from '../app.js';
import { closeSharedCarePool, sharedCarePool, careTable } from '../lib/care-database.js';
import { readDailySiteCounts } from '../../scripts/release/demand-adapter.mjs';

test('daily adapter sends one aggregate call and refuses open, malformed or mismatched days', () => {
  const expected={schema:'pilot.daily-site-counts.v1',site:'samedaydesk.com',day:'2026-01-02'};
  assert.equal(readDailySiteCounts({day:'2026-01-02',sql:query=>{
    assert.equal(query,"select samedaydesk_care.daily_site_counts('2026-01-02'::pg_catalog.date) as counts");
    return [{counts:expected}];
  }}),expected);
  const forbidden=()=>assert.fail('invalid date reached the database');
  for(const day of ['2026-02-30','yesterday',new Date().toISOString().slice(0,10)]) {
    assert.throws(()=>readDailySiteCounts({day,sql:forbidden}));
  }
  assert.throws(()=>readDailySiteCounts({day:expected.day,sql:()=>[{counts:{...expected,site:'other.test'}}]}),/not received/);
});

test('configured Report handoff records a single existing journey fact and leaves refusal unrecorded', async t => {
  assert.equal(process.env.SDS_PRIVATE_PREVIEW,'1');
  const order=randomUUID(), actor=randomUUID(), refused=randomUUID();
  let calls=0;
  const house=createServer(async (req,res)=>{
    const chunks=[];
    for await(const chunk of req) chunks.push(chunk);
    const input=JSON.parse(Buffer.concat(chunks));
    calls++;
    assert.equal(req.url,'/v1/desk/report-orders');
    assert.equal(input.brand,'sds');
    res.setHeader('Content-Type','application/json');
    if(input.order===refused) {res.statusCode=409;res.end('{}');return;}
    assert.equal(input.order,order);
    res.end(JSON.stringify({ok:true,result:{order,url:`https://buy.stripe.com/test_fixture?client_reference_id=report_${order}`}}));
  }).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>house.close(resolve)));
  await once(house,'listening');
  process.env.SDS_REPORT_ORDER_USDC='1';
  process.env.SDS_TEST_REPORT_ORDER_ENDPOINT=`http://127.0.0.1:${house.address().port}/v1/desk/report-orders`;
  const app=createSdsApp({care:null}).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>app.close(resolve)));
  t.after(closeSharedCarePool);
  await once(app,'listening');
  const send=newOrder=>fetch(`http://127.0.0.1:${app.address().port}/api/checkout/seller-conformance/order`,{
    method:'POST',headers:{'content-type':'application/json',cookie:`sds_session=${actor}`},body:JSON.stringify({order:newOrder,method:'card'}),
  });
  assert.equal((await send(order)).status,201);
  assert.equal((await send(order)).status,201);
  assert.equal((await send(refused)).status,409);
  assert.equal(calls,3);
  const {rows}=await sharedCarePool().query(`select order_id,session_id,event,test,utm from ${careTable('journey_events')} where order_id=any($1)`,[[order,refused]]);
  assert.deepEqual(rows,[{order_id:order,session_id:actor,event:'checkout_started',test:true,utm:{checkout_family:'one_route_report'}}]);
});
