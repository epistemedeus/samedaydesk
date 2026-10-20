import { readFile } from 'node:fs/promises';
import { checkedFundingProof, digest, requireThat, PRODUCTION_ASSETS } from '../../agent-economy-foundation/dist/index.js';
import { COLD_SCOPE, coldKey, coldRequest, coldReceipt, checkedColdResult, transitionId } from './cold-receipt.mjs';

export class MarketStore {
  constructor(pool, schema, assets = PRODUCTION_ASSETS) {
    requireThat(/^[a-z][a-z0-9_]{0,62}$/.test(schema), 'invalid_schema');
    this.pool = pool;
    this.schema = schema;
    this.assets = assets;
  }
  table(name) { return `"${this.schema}"."ae14_market_${name}"`; }
  async prepare() {
    const sql = await readFile(new URL('../migrations/001-market.sql', import.meta.url), 'utf8');
    await this.pool.query(sql.replaceAll('__SCHEMA__', `"${this.schema}"`));
  }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async task(tenant, id, client = this.pool, lock = false) {
    const row = (await client.query(`SELECT * FROM ${this.table('tasks')} WHERE tenant_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [tenant,id])).rows[0];
    requireThat(row, 'forbidden');
    return row;
  }
  async locked(tenant, id, fn) {
    return this.transaction(async client => fn(await this.task(tenant,id,client,true),client));
  }
  async read(tenant, id) {
    return (await this.pool.query(`SELECT binding FROM ${this.table('quotes')} WHERE tenant_id=$1 AND id=$2`, [tenant,id])).rows[0]?.binding ?? null;
  }
  async hasFunding(tenant, taskId, client = this.pool) {
    return Boolean((await client.query(`SELECT 1 FROM ${this.table('funding')} f JOIN ${this.table('quotes')} q ON q.allocation_id=f.allocation_id WHERE q.tenant_id=$1 AND q.task_id=$2`, [tenant,taskId])).rows.length);
  }
  async measure(tenant, taskId, kind, eventId, actorId, payload, client = this.pool) {
    await client.query(`INSERT INTO ${this.table('measures')}(tenant_id,task_id,kind,event_id,actor_id,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [tenant,taskId,kind,eventId,actorId,JSON.stringify(payload)]);
    const prior = (await client.query(`SELECT actor_id,payload FROM ${this.table('measures')} WHERE tenant_id=$1 AND task_id=$2 AND kind=$3 AND event_id=$4`, [tenant,taskId,kind,eventId])).rows[0];
    requireThat(prior.actor_id === actorId && digest(prior.payload) === digest(payload), 'measurement_conflict');
    return payload;
  }
  async measures(tenant, taskId) {
    return (await this.pool.query(`SELECT kind,event_id,actor_id,payload FROM ${this.table('measures')} WHERE tenant_id=$1 AND task_id=$2 ORDER BY kind,event_id`, [tenant,taskId])).rows;
  }
  coldTable() { return `"${this.schema}"."earned_work_idempotency"`; }
  async coldPrior(client, actor, operationId) {
    return (await client.query(`SELECT request_hash,response_json,principal_id FROM ${this.coldTable()}
      WHERE scope=$1 AND task_id='' AND key=$2`,[COLD_SCOPE,coldKey(actor,operationId)])).rows[0];
  }
  async coldTransitions(client, actor, operationId) {
    return (await client.query(`SELECT task_id,event_id,payload FROM ${this.table('measures')}
      WHERE tenant_id=$1 AND actor_id=$2 AND kind='transition' AND payload->>'operationId'=$3
      AND payload->>'action' IN ('post','interest')`,[actor.tenantId,actor.actorId,operationId])).rows;
  }
  // Only cold post/interest use this transaction. External money callbacks never enter it.
  async coldMutation({origin,actor,action,input,operationId,moneyProvenance}, effect) {
    const request=coldRequest(origin,actor,action,input,operationId), requestHash=digest(request);
    return this.transaction(async client=>{
      // Serialize the actor's key across both actions, including an absent prior row.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[COLD_SCOPE+':'+coldKey(actor,operationId)]);
      const prior=await this.coldPrior(client,actor,operationId);
      if(prior){
        requireThat(prior.principal_id===actor.actorId && prior.request_hash===requestHash,'operation_conflict');
        return checkedColdResult(request,prior.response_json);
      }
      requireThat((await this.coldTransitions(client,actor,operationId)).length===0,'legacy_operation_readback_required');
      const result=coldReceipt(request,await effect(client));
      await this.measure(actor.tenantId,result.taskId,'transition',transitionId(actor,action,operationId),actor.actorId,
        {action,verification:'server_observed',source:'hosted-machine-market',operationId,moneyProvenance,acquisition:'unknown',
          bodyDigest:request.bodyDigest,receiptId:result.receipt.receiptId},client);
      await client.query(`INSERT INTO ${this.coldTable()}(scope,task_id,key,request_hash,status_code,response_json,principal_id,created_at)
        VALUES($1,'',$2,$3,200,$4,$5,now())`,[COLD_SCOPE,coldKey(actor,operationId),requestHash,JSON.stringify(result),actor.actorId]);
      return result;
    });
  }
  async coldReadback({origin,actor,action,input,operationId,postTaskId}) {
    const request=coldRequest(origin,actor,action,input,operationId);
    return this.transaction(async client=>{
      // One consistent read-only snapshot; this port cannot create a business effect or receipt row.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const prior=await this.coldPrior(client,actor,operationId);
      if(prior){
        requireThat(prior.principal_id===actor.actorId && prior.request_hash===digest(request),'operation_conflict');
        return checkedColdResult(request,prior.response_json);
      }
      const events=await this.coldTransitions(client,actor,operationId);
      requireThat(events.length>0,'operation_absent');
      requireThat(events.length===1,'legacy_receipt_ambiguous');
      const event=events[0],taskId=action==='post'?postTaskId:input.taskId;
      requireThat(event.task_id===taskId && event.event_id===transitionId(actor,action,operationId) &&
        event.payload.action===action && event.payload.verification==='server_observed' &&
        event.payload.source==='hosted-machine-market' && !event.payload.receiptId,'operation_conflict');
      const task=await this.task(actor.tenantId,taskId,client);
      let result;
      if(action==='post'){
        const recorded=Object.fromEntries(['title','summary','criteria','payableKinds'].map(k=>[k,task.spec[k]]));
        requireThat(task.requester_id===actor.actorId && digest(recorded)===digest(input),'operation_conflict');
        result={taskId,spec:task.spec,state:'unfunded_interest'};
      }else{
        const interests=(await client.query(`SELECT note FROM ${this.table('interests')} WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3`,[actor.tenantId,taskId,actor.actorId])).rows;
        const count=(await client.query(`SELECT count(*)::int n FROM ${this.table('measures')} WHERE tenant_id=$1 AND task_id=$2
          AND actor_id=$3 AND kind='transition' AND payload->>'action'='interest'`,[actor.tenantId,taskId,actor.actorId])).rows[0].n;
        requireThat(count===1,'legacy_receipt_ambiguous');
        requireThat(interests.length===1 && interests[0].note===input.note && task.requester_id!==actor.actorId,'operation_conflict');
        result={taskId,actorId:actor.actorId,state:'unfunded_interest'};
      }
      // Historical transitions did not record the original body or HTTP bytes. Do not invent them.
      return coldReceipt(request,result,'legacy_transition_and_current_effect');
    });
  }
}

/** Durable F1 FundingReservations; only globally unique proof metadata. */
export class PostgresFundingReservations {
  constructor(store) { this.store = store; }
  async reserve(input) {
    const p = checkedFundingProof(input), s = this.store;
    return s.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['ae14-proof',p.asset.chain,p.asset.token.toLowerCase(),p.proofId])]);
      try {
        await client.query(`INSERT INTO ${s.table('funding')}(chain,token,proof_id,tenant_id,allocation_id,proof) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(chain,token,proof_id) DO NOTHING`, [p.asset.chain,p.asset.token.toLowerCase(),p.proofId,p.tenantId,p.allocationId,JSON.stringify(p)]);
      } catch (error) { if (error.code === '23505') requireThat(false,'allocation_already_funded'); throw error; }
      const prior = (await client.query(`SELECT proof FROM ${s.table('funding')} WHERE chain=$1 AND token=$2 AND proof_id=$3 FOR UPDATE`, [p.asset.chain,p.asset.token.toLowerCase(),p.proofId])).rows[0].proof;
      const terms = ({state,finalityRef,...rest}) => rest;
      requireThat(digest(terms(prior)) === digest(terms(p)), 'proof_already_allocated');
      requireThat(prior.state !== 'failed' || p.state === 'failed', 'finality_conflict');
      requireThat(p.state !== 'confirmed' || p.finalityRef, 'missing_finality');
      await client.query(`UPDATE ${s.table('funding')} SET proof=$4 WHERE chain=$1 AND token=$2 AND proof_id=$3`, [p.asset.chain,p.asset.token.toLowerCase(),p.proofId,JSON.stringify(p)]);
      return { proof:p, available:p.state === 'confirmed' };
    });
  }
  async read(tenant, allocation) {
    const p = (await this.store.pool.query(`SELECT proof FROM ${this.store.table('funding')} WHERE tenant_id=$1 AND allocation_id=$2`, [tenant,allocation])).rows[0]?.proof;
    return p ? {proof:p,available:p.state === 'confirmed'} : null;
  }
}
