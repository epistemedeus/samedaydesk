import { createHash } from 'node:crypto';
import {
  checked, requireThat, digest, atomic, feeAt, freezeQuote, BASE_USDC, PRODUCTION_ASSETS, canonicalRewardForQuote,
  COMMERCE_PAYMENTS_PIN, CanonicalFoundation, FundingService, ApprovalCapture, liveFundingAuthority,
  CanonicalAcceptanceSettlement, PostgresApprovalJournal, PostgresCaptureReceipts,
} from '../../agent-economy-foundation/dist/index.js';
import { PostgresFundingReservations } from './store.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const key = value => { requireThat(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(value),'invalid_input'); return value; };
const text = (value, max = 4096) => { requireThat(typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= max,'invalid_input'); return value; };
const exact = (value, keys) => {
  requireThat(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k)), 'invalid_input');
  return value;
};
const operation = (actor, action, id) => digest({actor,action,id:key(id)});
const profile = {id:'commerce-payments-v1.1.0-single-capture',rounding:'per_capture_floor',mode:'single_capture',escrow:COMMERCE_PAYMENTS_PIN};

/** Requester adapter. All account and kernel authorities are injected. */
export class RequesterMarket {
  constructor({ store, kernel, accounts, authenticate, members, money, feeRecipient, fundingTarget, settlementAuthorityId, costs, partyTerms, coldOrigin=null, kernelProvenance='test', assets = PRODUCTION_ASSETS, asset = BASE_USDC, now = () => new Date() }) {
    requireThat(['fake','local_chain','production','unavailable'].includes(money.qualification),'sandbox_money_required');
    assets.registration(asset);
    requireThat(store.assets === assets, 'asset_registry_binding');
    requireThat(['test','fixture','production'].includes(kernelProvenance)&&(kernelProvenance!=='production'||money.qualification==='production'),'kernel_provenance');
    Object.assign(this,{store,kernel,accounts,authenticate,members,money,feeRecipient,fundingTarget,settlementAuthorityId,costs,partyTerms,coldOrigin,kernelProvenance,assets,asset,now});
    this.funding = new PostgresFundingReservations(store);
    this.fundingService = new FundingService(money,this.funding,now,assets);
    this.approvals = new PostgresApprovalJournal(store.pool,store.schema);
    this.receipts = new PostgresCaptureReceipts(store.pool,store.schema);
    // F1 Amendment 2: the identical admitted asset registry crosses every port.
    // The installed A callback rechecks this saved review at broadcast too.
    const outcome=input=>{
      const result=checked('CaptureOutcome',input);
      requireThat(result.provenance===money.qualification || (result.state==='unknown' && result.provenance==='unknown'),'capture_provenance_conflict');
      return result;
    };
    const port = {protocol:money.protocol,readback:async r=>outcome(await money.captureOutcome(r)),capture:async r=>{await this.authorizeCaptureRequest(r);return outcome(await money.capture(r));}};
    this.capture = new ApprovalCapture(this.approvals,port,new CanonicalAcceptanceSettlement(kernel,this.receipts,assets),assets);
    // Every claim re-reads the injected source. A missing read port refuses; a stored available label is not authority.
    this.fundingAuthority = liveFundingAuthority(money);
    this.foundation = new CanonicalFoundation(kernel,accounts,store,this.funding,now,this.capture,assets,this.fundingAuthority);
  }
  async prepare() { await this.store.prepare(); await this.approvals.prepare(); await this.receipts.prepare(); }
  async actor(context) {
    const a = await this.authenticate(context);
    requireThat(a,'unauthorized');
    checked('AuthenticatedActor',a);
    const m = await this.members.resolve(a.tenantId,a.actorId);
    requireThat(m && m.actorId === a.actorId && m.tenantId === a.tenantId,'unauthorized');
    return a;
  }
  async member(actorId,tenantId) {
    const m = await this.members.resolve(tenantId,actorId);
    requireThat(m && m.actorId === actorId && m.tenantId === tenantId,'forbidden');
    return m;
  }
  owner(actor,row) { requireThat(actor.actorId === row.requester_id,'forbidden'); }
  async bound(actor,taskId,role = 'any') {
    const row = await this.store.task(actor.tenantId,key(taskId));
    const binding = row.current_quote ? await this.store.read(actor.tenantId,row.current_quote) : null;
    const ids = role === 'requester' ? [row.requester_id] : role === 'contributor' ? [binding?.quote.contributorId] : [row.requester_id,binding?.quote.contributorId];
    requireThat(ids.includes(actor.actorId),'forbidden');
    return {row,binding};
  }
  async selected(actor,taskId,quoteDigest,role) {
    const b = await this.bound(actor,taskId,role);
    requireThat(b.binding && b.row.selected_quote === b.binding.quote.quoteId,'selection_required');
    requireThat(digest(b.binding.quote) === quoteDigest,'quote_changed');
    const q = b.binding.quote;
    const assents = (await this.store.pool.query(`SELECT actor_id,quote_digest FROM ${this.store.table('assents')} WHERE tenant_id=$1 AND quote_id=$2`,[actor.tenantId,q.quoteId])).rows;
    requireThat([q.requesterId,q.contributorId].every(id => assents.some(a=>a.actor_id === id && a.quote_digest === quoteDigest)),'renewed_assent_required');
    return b;
  }
  async post(context,input,operationId) {
    const a = await this.actor(context);
    exact(input,['title','summary','criteria','payableKinds']);
    text(input.title,160); text(input.summary);
    requireThat(Array.isArray(input.criteria) && input.criteria.length > 0 && input.criteria.length <= 16 && new Set(input.criteria).size === input.criteria.length,'invalid_input');
    input.criteria.forEach(k=>key(k));
    requireThat(Array.isArray(input.payableKinds) && input.payableKinds.length > 0 && new Set(input.payableKinds).size === input.payableKinds.length && input.payableKinds.every(k=>['usable','no_fit','failure'].includes(k)),'invalid_input');
    const member = await this.member(a.actorId,a.tenantId);
    const spec = {...input,slotLimit:1,milestoneLimit:1,cohort:member.cohort ?? 'unknown'};
    requireThat(['owner_qa','sponsored','outside','unknown'].includes(spec.cohort),'cohort_authority_required');
    const id = `market-${operation(a,'post',operationId)}`, hash = digest(spec);
    return this.store.coldMutation({origin:this.coldOrigin,actor:a,action:'post',input,operationId,moneyProvenance:this.money.qualification},async client=>{
      await client.query(`INSERT INTO ${this.store.table('tasks')}(tenant_id,id,requester_id,spec,request_digest) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[a.tenantId,id,a.actorId,JSON.stringify(spec),hash]);
      const row = await this.store.task(a.tenantId,id,client);
      requireThat(row.requester_id === a.actorId && row.request_digest === hash,'operation_conflict');
      return {taskId:id,spec:row.spec,state:'unfunded_interest'};
    });
  }
  async list(context) {
    const a = await this.actor(context);
    const rows = (await this.store.pool.query(`SELECT id,spec,current_quote,selected_quote FROM ${this.store.table('tasks')} WHERE tenant_id=$1 ORDER BY id`,[a.tenantId])).rows;
    return rows.map(row=>({taskId:row.id,title:row.spec.title,summary:row.spec.summary,criteria:row.spec.criteria,payableKinds:row.spec.payableKinds,assigned:Boolean(row.selected_quote)}));
  }
  async interest(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','note']); text(input.note);
    key(operationId);key(input.taskId);
    return this.store.coldMutation({origin:this.coldOrigin,actor:a,action:'interest',input,operationId,moneyProvenance:this.money.qualification},async client=>{
      const row=await this.store.task(a.tenantId,input.taskId,client,true);
      requireThat(a.actorId !== row.requester_id,'actor_conflict');
      await client.query(`INSERT INTO ${this.store.table('interests')}(tenant_id,task_id,actor_id,note) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,task_id,actor_id) DO UPDATE SET note=EXCLUDED.note`,[a.tenantId,row.id,a.actorId,input.note]);
      return {taskId:row.id,actorId:a.actorId,state:'unfunded_interest'};
    });
  }
  async readback(context,input,operationId) {
    const a=await this.actor(context);exact(input,['action','input']);key(operationId);
    requireThat(['post','interest'].includes(input.action),'invalid_input');
    const body=input.input;
    if(input.action==='post'){
      exact(body,['title','summary','criteria','payableKinds']);
    }else{exact(body,['taskId','note']);key(body.taskId);text(body.note);}
    return this.store.coldReadback({origin:this.coldOrigin,actor:a,action:input.action,input:body,operationId,
      postTaskId:input.action==='post'?`market-${operation(a,'post',operationId)}`:null});
  }
  async quote(context,input,operationId) {
    const a = await this.actor(context);
    exact(input,['taskId','contributorId','gross','railCostCap','expiresAt']);
    key(input.taskId); key(input.contributorId); atomic(input.gross); atomic(input.railCostCap);
    requireThat(Number.isFinite(Date.parse(input.expiresAt)) && Date.parse(input.expiresAt) > this.now().getTime(),'quote_expired');
    return this.store.locked(a.tenantId,input.taskId,async (row,client)=>{
      this.owner(a,row);
      const qid = `quote-${operation(a,'quote',operationId)}`, commandDigest = digest(input);
      const prior = (await client.query(`SELECT command_digest,binding FROM ${this.store.table('quotes')} WHERE tenant_id=$1 AND id=$2`,[a.tenantId,qid])).rows[0];
      if (prior) { requireThat(prior.command_digest === commandDigest,'operation_conflict'); return prior.binding; }
      requireThat(!await this.store.hasFunding(a.tenantId,row.id,client),'funding_already_started');
      const interest = (await client.query(`SELECT 1 FROM ${this.store.table('interests')} WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3`,[a.tenantId,row.id,input.contributorId])).rows[0];
      requireThat(interest,'contributor_interest_required');
      const m = await this.member(input.contributorId,a.tenantId);
      key(m.payoutDestination);
      const fee = feeAt(input.gross), net = (atomic(input.gross)-atomic(fee)).toString();
      const draft = freezeQuote({schemaVersion:'pilot.agent-economy.v2',quoteId:qid,tenantId:a.tenantId,taskId:row.id,canonicalTaskId:`pending:${qid}`,taskVersion:row.version+1,termsVersion:'pending',
        requesterId:a.actorId,evaluatorId:a.actorId,contributorId:m.actorId,payoutDestination:m.payoutDestination,fundingAuthorityId:this.money.authorityId,settlementAuthorityId:this.settlementAuthorityId,
        asset:this.asset,gross:input.gross,contributorNet:net,platformFee:fee,subsidy:input.railCostCap,feeRecipient:this.feeRecipient,
        fee:{schemaVersion:'pilot.agent-economy.v2',bps:500,basis:'new_job_gross',profile},rail:{mode:'platform_subsidy',costCap:input.railCostCap},fundingTarget:this.fundingTarget,expiresAt:input.expiresAt,
        rules:{partial:'accepted_gross_only',refund:'unaccepted_gross_only',dispute:'hold_until_authoritative_resolution',reversal:'reconcile_without_repricing_earned_obligation',rightsTermsRef:'terms:pending'}},this.assets);
      const reward = canonicalRewardForQuote(draft,this.assets);
      const parties=this.partyTerms?await this.partyTerms(a,m):null;
      const summary = JSON.stringify({...(parties?{parties}:{}),spec:row.spec,contributorId:m.actorId,payoutDestination:m.payoutDestination,asset:this.asset,gross:input.gross,fee,feeRecipient:this.feeRecipient,profile,railCostCap:input.railCostCap,expiresAt:input.expiresAt});
      const created = await this.kernel.createTask({title:row.spec.title,summary:row.spec.summary,provenance:this.kernelProvenance,budget:reward,correctionMaxRevisions:0,
        terms:{summary,reward,claimTtlSeconds:3600,maxArtifactBytes:65536,allowedMediaTypes:['application/json'],slotLimit:1},
        idempotencyKey:qid,requestHash:digest({input,summary})});
      const canonical = created.body.task;
      const q = freezeQuote({...draft,canonicalTaskId:canonical.id,termsVersion:canonical.termsVersion,rules:{...draft.rules,rightsTermsRef:`terms:${canonical.termsVersion}`}},this.assets);
      const task = checked('Task',{schemaVersion:'pilot.agent-economy.v1',tenantId:a.tenantId,taskId:row.id,canonicalTaskId:q.canonicalTaskId,taskVersion:q.taskVersion,termsVersion:q.termsVersion,requesterId:a.actorId,evaluatorId:a.actorId,publicText:row.spec.summary,slotLimit:1});
      const binding = {task,quote:q,...(parties?{parties}:{})};
      await client.query(`INSERT INTO ${this.store.table('quotes')}(tenant_id,id,task_id,allocation_id,command_digest,binding) VALUES($1,$2,$3,$4,$5,$6)`,[a.tenantId,qid,row.id,q.canonicalTaskId,commandDigest,JSON.stringify(binding)]);
      await client.query(`UPDATE ${this.store.table('tasks')} SET version=$3,current_quote=$4,selected_quote=NULL WHERE tenant_id=$1 AND id=$2`,[a.tenantId,row.id,q.taskVersion,qid]);
      return binding;
    });
  }
  async assent(context,input,operationId,select = false) {
    const a = await this.actor(context); exact(input,['taskId','quoteId','quoteDigest']); key(input.quoteId);
    requireThat(select === true || select === false,'invalid_input');
    if (operationId !== undefined) key(operationId);
    return this.store.locked(a.tenantId,key(input.taskId),async (row,client)=>{
      const b = await this.store.read(a.tenantId,input.quoteId), q = b?.quote;
      requireThat(q && q.taskId === row.id && row.current_quote === input.quoteId,'quote_changed');
      requireThat(digest(q) === input.quoteDigest,'quote_changed');
      requireThat(this.now().getTime() < Date.parse(q.expiresAt),'quote_expired');
      requireThat(select ? a.actorId === q.requesterId : a.actorId === q.contributorId,'forbidden');
      await client.query(`INSERT INTO ${this.store.table('assents')}(tenant_id,quote_id,actor_id,quote_digest) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[a.tenantId,q.quoteId,a.actorId,input.quoteDigest]);
      if (select) await client.query(`UPDATE ${this.store.table('tasks')} SET selected_quote=$3 WHERE tenant_id=$1 AND id=$2`,[a.tenantId,row.id,q.quoteId]);
      return {quoteId:q.quoteId,quoteDigest:digest(q),assented:true};
    });
  }
  select(context,input,operationId) { return this.assent(context,input,operationId,true); }
  async fund(context,input) {
    const a = await this.actor(context); exact(input,['taskId','quoteDigest','proofId']); key(input.proofId);
    return this.store.locked(a.tenantId,key(input.taskId),async()=>{
      const {binding:{quote:q}} = await this.selected(a,input.taskId,input.quoteDigest,'requester');
      // This is readback only. A owns signing/submission and its operation journal.
      const f = await this.fundingService.reserve(a,q,input.proofId);
      if (f.available) await this.kernel.reserveFunding(q.canonicalTaskId,`fund-${digest({quote:q.quoteId,proof:input.proofId})}`,digest(f.proof));
      return {state:f.available?'confirmed_escrow':'funding_pending',proof:f.proof};
    });
  }
  async claim(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','quoteDigest']);
    const {binding:{quote:q}} = await this.selected(a,input.taskId,input.quoteDigest,'contributor');
    // No B claim/slot lock: the existing kernel transaction and constraints own this race.
    return this.foundation.claim(a,q.quoteId,operation(a,'claim',operationId));
  }
  evidence(input,spec) {
    exact(input,['kind','businessResult','attempts','criterionResults','nextDecision']);
    requireThat(['usable','no_fit','failure'].includes(input.kind),'invalid_evidence');
    text(input.businessResult); text(input.nextDecision);
    requireThat(Array.isArray(input.attempts) && input.attempts.length > 0 && input.attempts.length <= 32,'invalid_evidence');
    input.attempts.forEach(x=>{exact(x,['action','result','evidence']);text(x.action);text(x.result);text(x.evidence);});
    requireThat(Array.isArray(input.criterionResults) && input.criterionResults.length === spec.criteria.length && new Set(input.criterionResults.map(x=>x.criterionId)).size === spec.criteria.length,'invalid_evidence');
    input.criterionResults.forEach(x=>{exact(x,['criterionId','observation','passed']);requireThat(spec.criteria.includes(x.criterionId) && typeof x.passed === 'boolean','invalid_evidence');text(x.observation);});
    const bytes = Buffer.from(JSON.stringify(input));
    requireThat(bytes.length <= 65536,'evidence_too_large');
    return bytes;
  }
  async deliver(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','quoteDigest','reservationId','evidence']); key(input.reservationId);
    const {row,binding:{quote:q}} = await this.selected(a,input.taskId,input.quoteDigest,'contributor');
    const bytes = this.evidence(input.evidence,row.spec);
    const principal = await this.accounts.principal(a.tenantId,a.actorId,q.canonicalTaskId);
    requireThat(principal && principal.payoutDestination === q.payoutDestination,'principal_binding');
    const artifact = {ref:`retained:sha256:${sha(bytes)}`,digestSha256:sha(bytes),mediaType:'application/json',bytes:bytes.length};
    return this.kernel.submit({taskId:q.canonicalTaskId,reservationId:input.reservationId,contributor:principal,artifact,evidenceBytes:bytes,idempotencyKey:operation(a,'deliver',operationId),requestHash:digest({artifact,reservationId:input.reservationId})});
  }
  async review(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','quoteDigest','useful','reason']); text(input.reason); requireThat(typeof input.useful === 'boolean','invalid_input');
    return this.store.locked(a.tenantId,key(input.taskId),async (row,client)=>{
      const {binding:{quote:q}} = await this.selected(a,row.id,input.quoteDigest,'requester');
      const approval = await this.approval(a.tenantId,q.canonicalTaskId);
      requireThat(!approval,'approval_already_started');
      const canonical = await this.kernel.getTask(q.canonicalTaskId);
      requireThat(canonical?.submission && canonical.submissionEvidenceBytes,'retained_evidence_required');
      const evidence = JSON.parse(canonical.submissionEvidenceBytes.toString('utf8'));
      this.evidence(evidence,row.spec);
      requireThat(sha(canonical.submissionEvidenceBytes) === canonical.submission.artifact.digestSha256,'artifact_changed');
      if (input.useful) {
        requireThat(row.spec.payableKinds.includes(evidence.kind),'outcome_not_payable_under_terms');
        requireThat(evidence.kind !== 'usable' || evidence.criterionResults.every(x=>x.passed),'criteria_not_met');
      }
      const verdict = await this.kernel.createVerdict({taskId:q.canonicalTaskId,reservationId:canonical.reservation.id,outcome:input.useful?'pass':'fail',verifierVersion:'ae14-requester-review-v1',reasons:[input.reason],artifactDigestSha256:canonical.submission.artifact.digestSha256,idempotencyKey:operation(a,'review',operationId),requestHash:digest(input)});
      const payload = {verdictId:verdict.body.verdict.id,artifactDigest:canonical.submission.artifact.digestSha256,useful:input.useful,outcomeKind:evidence.kind,reason:input.reason,authority:'requester_review'};
      await this.store.measure(a.tenantId,row.id,'review',payload.verdictId,a.actorId,payload,client);
      return payload;
    });
  }
  async approval(tenant,allocation) {
    return this.approvals.exclusive(tenant,allocation,records=>records.read(tenant,allocation));
  }
  /** Server-only A callback, supplied at A's construction. No HTTP action.
   * Read the committed intent without another advisory lock: F1 holds that
   * lock while invoking A, so re-entering it here would deadlock capture. */
  async authorizeCaptureRequest(input) {
    const r=checked('CaptureRequest',input);
    const saved=(await this.store.pool.query(`SELECT record FROM "${this.store.schema}".ae14_capture_approvals WHERE tenant_id=$1 AND allocation_id=$2`,[r.tenantId,r.allocationId])).rows[0]?.record;
    requireThat(saved && saved.state==='approval_pending' && digest(saved.request)===digest(r) && digest(saved.approval)===r.approvalDigest,'review_authority_required');
    const q=freezeQuote(saved.quote,this.assets),row=await this.store.task(r.tenantId,q.taskId);
    requireThat(row.requester_id===r.actorId && row.selected_quote===r.quoteId && row.current_quote===r.quoteId && digest(q)===r.quoteDigest,'capture_request_binding');
    await this.member(r.actorId,r.tenantId);
    const canonical=await this.kernel.getTask(r.allocationId),principal=await this.accounts.principal(r.tenantId,q.contributorId,r.allocationId);
    requireThat(principal && principal.payoutDestination===q.payoutDestination && canonical?.reservation?.contributorPublicId===principal.publicId,'principal_binding');
    requireThat(canonical.terms.version===q.termsVersion && canonical.reservation.id===saved.approval.reservationId && canonical.verdict?.id===saved.approval.verdictId && canonical.verdict.outcome==='pass' && canonical.verdict.artifactDigestSha256===saved.approval.artifactDigestSha256 && canonical.submission?.artifact.digestSha256===saved.approval.artifactDigestSha256,'review_approval_binding');
  }
  async approve(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','quoteDigest']);
    return this.store.locked(a.tenantId,key(input.taskId),async (row)=>{
      const {binding:{quote:q}} = await this.selected(a,row.id,input.quoteDigest,'requester');
      const canonical = await this.kernel.getTask(q.canonicalTaskId);
      requireThat(canonical?.verdict?.outcome === 'pass','review_required');
      const measures = await this.store.measures(a.tenantId,row.id);
      requireThat(measures.some(m=>m.kind === 'review' && m.payload.verdictId === canonical.verdict.id && m.payload.useful),'review_journal_required');
      return this.foundation.accept(a,q.quoteId,{operationId:operation(a,'approve',operationId),reservationId:canonical.reservation.id,verdictId:canonical.verdict.id,artifactDigestSha256:canonical.submission.artifact.digestSha256});
    });
  }
  async reconcile(context,input) {
    const a = await this.actor(context); exact(input,['taskId']);
    return this.store.locked(a.tenantId,key(input.taskId),async row=>{
      this.owner(a,row);
      const b = await this.store.read(a.tenantId,row.current_quote);
      requireThat(b,'quote_required');
      return this.capture.observe(a,a.tenantId,b.quote.canonicalTaskId);
    });
  }
  async payoutDisposition(context,input) {
    const a=await this.actor(context);exact(input,['taskId']);
    const {binding}=await this.bound(a,input.taskId,'requester');
    requireThat(binding,'quote_required');
    // SA4 is the payout authority. An unchanged canonical owed projection is
    // never permission for another transfer on a capture allocation.
    return this.foundation.payoutDisposition(a,binding.quote.quoteId,this.receipts);
  }
  async read(context,input) {
    const a = await this.actor(context); exact(input,['taskId']);
    const {row,binding} = await this.bound(a,input.taskId);
    const q = binding?.quote, canonical = q ? await this.kernel.getTask(q.canonicalTaskId) : null;
    const f = q ? await this.funding.read(a.tenantId,q.canonicalTaskId) : null;
    const approval = q ? await this.approval(a.tenantId,q.canonicalTaskId) : null;
    const measures = await this.store.measures(a.tenantId,row.id);
    const state = approval?.state ?? (canonical?.verdict ? 'reviewed' : canonical?.submission ? 'delivered' : canonical?.reservation ? 'claimed' : f?.available ? 'funded' : 'unfunded_interest');
    let currentFulfillment={state:approval?'hold':'not_captured',observation:'unavailable'};
    if(approval){
      let observed;try{observed=await this.money.captureOutcome(approval.request);}catch{observed=null;}
      const settled=approval.settlement;
      const confirmed=settled&&observed?.state==='captured'&&observed.finality==='final'&&observed.txRef===settled.txRef&&
        observed.finalityRef===settled.finalityRef&&observed.amount===q.gross&&observed.feeAmount===q.platformFee&&observed.feeRecipient===q.feeRecipient;
      currentFulfillment={state:confirmed?'confirmed_capture':'hold',observation:observed?.state??'unknown'};
    }
    const incident=f&&typeof this.money.readIncident==='function'?await this.money.readIncident(f.proof.proofId):null;
    return {taskId:row.id,spec:row.spec,quote:q??null,partyTerms:binding?.parties??null,quoteDigest:q?digest(q):null,selected:row.selected_quote === q?.quoteId,state,funding:f,claim:canonical?.reservation??null,submission:canonical?.submission??null,verdict:canonical?.verdict??null,obligation:canonical?.obligation??null,settlement:approval?.settlement??null,captureOutcome:approval?.outcome??null,currentFulfillment,incident,measures};
  }
  async grantConsumer(context,input) {
    const a = await this.actor(context); exact(input,['taskId','consumerId']);
    const {row} = await this.bound(a,input.taskId,'requester'); await this.member(key(input.consumerId),a.tenantId);
    await this.store.pool.query(`INSERT INTO ${this.store.table('consumers')}(tenant_id,task_id,actor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[a.tenantId,row.id,input.consumerId]);
    return {granted:true};
  }
  async retainedFor(actor,taskId) {
    const row = await this.store.task(actor.tenantId,key(taskId));
    const binding = await this.store.read(actor.tenantId,row.current_quote), q = binding?.quote;
    const grant = (await this.store.pool.query(`SELECT 1 FROM ${this.store.table('consumers')} WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3`,[actor.tenantId,row.id,actor.actorId])).rows[0];
    requireThat(q && ([q.requesterId,q.contributorId].includes(actor.actorId) || grant),'forbidden');
    const canonical = await this.kernel.getTask(q.canonicalTaskId);
    requireThat(canonical?.submissionEvidenceBytes,'retained_evidence_required');
    const bytes = canonical.submissionEvidenceBytes;
    requireThat(sha(bytes) === canonical.submission.artifact.digestSha256,'artifact_changed');
    return {row,q,canonical,evidence:JSON.parse(bytes.toString('utf8')),artifactDigest:sha(bytes)};
  }
  async retained(context,input) {
    const a = await this.actor(context); exact(input,['taskId']);
    const result = await this.retainedFor(a,input.taskId);
    return {artifactDigest:result.artifactDigest,evidence:result.evidence};
  }
  async downstreamUse(context,input,operationId) {
    const a = await this.actor(context); exact(input,['taskId','artifactDigest','consumerRef','decision','avoidedTaskCount']);
    text(input.consumerRef,256); text(input.decision); requireThat(Number.isSafeInteger(input.avoidedTaskCount) && input.avoidedTaskCount >= 0 && input.avoidedTaskCount <= 1000,'invalid_input');
    const {row,q,artifactDigest} = await this.retainedFor(a,input.taskId);
    requireThat(a.actorId !== q.requesterId && a.actorId !== q.contributorId,'later_consumer_required');
    requireThat(input.artifactDigest === artifactDigest,'artifact_changed');
    return this.store.measure(a.tenantId,row.id,'downstream_use',operation(a,'downstream',operationId),a.actorId,{...input,verification:'authenticated_self_report',signedReceipt:false});
  }
  async serviceCost(context,input) {
    const a = await this.actor(context); exact(input,['taskId','costRef']); key(input.costRef);
    const {row} = await this.bound(a,input.taskId,'requester');
    requireThat(this.costs,'cost_authority_required');
    const cost = await this.costs.read(input.costRef);
    requireThat(cost && cost.tenantId === a.tenantId && cost.taskId === row.id && cost.costRef === input.costRef && cost.measurement === 'actual','cost_binding');
    atomic(cost.amount); key(cost.unit); key(cost.category); text(cost.source);
    return this.store.measure(a.tenantId,row.id,'service_cost',input.costRef,a.actorId,cost);
  }
  async repeatPurchase(context,input) {
    const a = await this.actor(context); exact(input,['taskId','repeatTaskId','reason']); text(input.reason);
    requireThat(input.taskId !== input.repeatTaskId,'distinct_purchase_required');
    const first = await this.read(context,{taskId:input.taskId}), next = await this.read(context,{taskId:input.repeatTaskId});
    requireThat(first.quote?.requesterId === a.actorId && next.quote?.requesterId === a.actorId,'forbidden');
    requireThat(first.state === 'accepted_settled' && next.state === 'accepted_settled','actual_capture_required');
    const outside = first.spec.cohort === 'outside' && next.spec.cohort === 'outside';
    const actualPaidDemand = outside && first.settlement.provenance === 'production' && next.settlement.provenance === 'production';
    return this.store.measure(a.tenantId,first.taskId,'repeat_purchase',next.taskId,a.actorId,{repeatTaskId:next.taskId,reason:input.reason,voluntaryAssent:true,actualPaidDemand,provenance:next.settlement.provenance});
  }
  async measurement(context,input) {
    const view = await this.read(context,input);
    const costs = {};
    for (const m of view.measures.filter(m=>m.kind === 'service_cost')) costs[m.payload.unit] = (BigInt(costs[m.payload.unit]??'0')+atomic(m.payload.amount)).toString();
    return {taskId:view.taskId,feeBase:view.quote?.gross??null,quotedFee:view.quote?.platformFee??null,roundingProfile:view.quote?.fee.profile??null,declaredRailCostCap:view.quote?.rail.costCap??null,
      confirmedFunding:view.funding?.available??false,serviceCosts:costs,reviews:view.measures.filter(m=>m.kind === 'review'),usefulOutcomes:view.measures.filter(m=>m.kind === 'review' && m.payload.useful),
      downstreamUse:view.measures.filter(m=>m.kind === 'downstream_use'),repeatPurchases:view.measures.filter(m=>m.kind === 'repeat_purchase'),
      qualifiedCapture:view.settlement?.qualified??false,currentFulfillment:view.currentFulfillment,provenance:view.settlement?.provenance??null,paidWork:view.currentFulfillment.state==='confirmed_capture' && view.settlement?.provenance === 'production' && view.spec.cohort === 'outside',cohort:view.spec.cohort};
  }
}
