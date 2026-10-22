import type pg from 'pg';
import type {Request, Response, NextFunction} from 'express';
import {z} from 'zod';
import {ApiError} from '../errors.js';
import {requireContributor} from '../auth.js';
import {requireIdempotencyKey} from '../validation.js';
import {hashTermsVersion} from '../terms-version.js';
import type {ContributorPrincipal, Provenance} from '../types.js';
import type {PostgresStore} from '../store/postgres.js';
import type {OpportunityService, OpportunityKernel} from './service.js';
import {parseBody, submitBodySchema} from './validate.js';

export type ContinuationScope = {roundKey:string; claimId:string; provenance:Provenance};
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const scopeSchema=z.object({roundKey:id,claimId:id,provenance:z.enum(['test','fixture','production'])}).strict();
const querySchema=z.object({provenance:z.enum(['test','fixture','production']),operationKey:z.string().min(1).max(200).optional()}).strict();

/** The original ledger checks CURRENT holder scope inside its transaction, including replays. */
export async function assertContinuationHolder(client:pg.PoolClient, scope:ContinuationScope, holder:ContributorPrincipal, now:Date) {
  scopeSchema.parse(scope);
  const round=(await client.query('SELECT * FROM opportunity_rounds WHERE round_key=$1 AND provenance=$2 FOR UPDATE',[scope.roundKey,scope.provenance])).rows[0];
  if(!round)throw new ApiError(404,'not_found','original source is unavailable');
  const token=(await client.query('SELECT * FROM earned_work_contributor_tokens WHERE id=$1 FOR SHARE',[holder.id])).rows[0];
  if(!token||token.revoked_at||(token.expires_at&&token.expires_at<=now))throw new ApiError(401,'unauthorized','holder credential is unavailable');
  if(token.task_scope!==`opportunity:${round.id}`||holder.taskScope!==token.task_scope||token.provenance!==scope.provenance||holder.provenance!==token.provenance)
    throw new ApiError(403,'forbidden','holder scope does not match the original source');
  const claim=(await client.query('SELECT * FROM opportunity_claims WHERE id=$1 AND round_id=$2 FOR UPDATE',[scope.claimId,round.id])).rows[0];
  if(!claim||claim.contributor_token_id!==holder.id)throw new ApiError(404,'not_found','original claim is unavailable');
  const offer=(await client.query('SELECT * FROM opportunity_offers WHERE id=$1 AND round_id=$2',[claim.offer_id,round.id])).rows[0];
  const terms=round.terms_document;
  if(!offer||!terms||hashTermsVersion(terms)!==round.terms_version||claim.terms_version!==round.terms_version||claim.reward_atomic!==offer.reward_atomic||
      terms.roundKey!==round.round_key||String(terms.principalCapAtomic)!==round.principal_cap_atomic||terms.asset!==round.asset||terms.network!==round.network||
      terms.chainId!==round.chain_id||terms.atomicScale!==round.atomic_scale||Date.parse(terms.submissionDeadline)!==round.submission_deadline.getTime()||
      terms.claimTtlSeconds!==round.claim_ttl_seconds||terms.maxEvidenceBytes!==round.max_evidence_bytes||terms.reviewWithinDays!==round.review_within_days||terms.maxClarifications!==round.max_clarifications)
    throw new ApiError(503,'invalid_storage','original terms failed validation');
  const offers=(await client.query('SELECT * FROM opportunity_offers WHERE round_id=$1',[round.id])).rows;
  if(!Array.isArray(terms.offers)||offers.length!==terms.offers.length||offers.some(row=>{
    const fixed=terms.offers.find((item:any)=>item.offerKey===row.offer_key);
    return !fixed||String(fixed.rewardAtomic)!==row.reward_atomic||fixed.title!==row.title||fixed.summary!==row.summary||fixed.acceptance!==row.acceptance||
      fixed.slotCount!==row.slot_count||(fixed.ownerReservedSlots??0)!==row.owner_reserved_slots||fixed.publicClaimable!==row.public_claimable||
      fixed.evidenceKind!==row.evidence_kind||fixed.maxEffortSeconds!==row.max_effort_seconds;
  }))throw new ApiError(503,'invalid_storage','original offers failed validation');
  return {round,claim,offer,terms};
}

/** Private canonical projection. It neither imports records nor changes earned obligations. */
export async function readOriginalContinuation(kernel:OpportunityKernel, scope:ContinuationScope, holder:ContributorPrincipal, operationKey?:string) {
  if(operationKey)requireIdempotencyKey(operationKey);
  return kernel.withOpportunityClient(async client=>{
    const {round,claim,offer,terms}=await assertContinuationHolder(client,scope,holder,kernel.now());
    const submission=(await client.query(`SELECT id,claim_id,terms_version,artifact_ref,artifact_digest_sha256,artifact_media_type,artifact_bytes,created_at
      FROM opportunity_submissions WHERE claim_id=$1 AND round_id=$2`,[claim.id,round.id])).rows[0];
    const obligation=(await client.query('SELECT id,claim_id,terms_version,settlement_key FROM opportunity_obligations WHERE claim_id=$1 AND round_id=$2',[claim.id,round.id])).rows[0];
    if((submission&&submission.terms_version!==claim.terms_version)||(obligation&&obligation.terms_version!==claim.terms_version))throw new ApiError(503,'invalid_storage','original delivery scope failed validation');
    const operation=operationKey?(await client.query(`SELECT principal_id,request_hash,status_code,response_json FROM earned_work_idempotency
      WHERE scope='opportunity_submit' AND task_id=$1 AND key=$2`,[round.id,operationKey])).rows[0]:null;
    if(operation&&(operation.principal_id!==holder.id||!operation.response_json||
      (operation.response_json.submission?.claimId??operation.response_json.claim?.id)!==claim.id))throw new ApiError(409,'conflict','operation belongs to another original claim');
    return {schema:'neomorphic.original-continuation.canonical.v1' as const,...scope,
      claim:{id:claim.id,termsVersion:claim.terms_version,status:claim.status==='reserved'&&claim.expires_at<=kernel.now()?'expired':claim.status,
        offerKey:offer.offer_key,expiresAt:claim.expires_at.toISOString(),deferStart:claim.defer_start},terms,
      submission:submission?{id:submission.id,claimId:submission.claim_id,termsVersion:submission.terms_version,
        artifact:{ref:submission.artifact_ref,digestSha256:submission.artifact_digest_sha256,mediaType:submission.artifact_media_type,bytes:submission.artifact_bytes},
        submittedAt:submission.created_at.toISOString()}:null,
      obligation:obligation?{id:obligation.id,claimId:obligation.claim_id,termsVersion:obligation.terms_version,settlementKey:obligation.settlement_key,payoutState:'owed' as const,paid:false as const}:null,
      operation:operation?{key:operationKey!,requestHash:operation.request_hash,statusCode:operation.status_code}:null};
  },'read');
}

/** Additive holder-only paths at the ORIGINAL route, sharing its exclusive submit/idempotency ledger. */
export function mountOriginalContinuationRoutes(app:{get:Function;post:Function},store:PostgresStore,opportunity:OpportunityService) {
  const scope=(req:Request,provenance:Provenance):ContinuationScope=>scopeSchema.parse({roundKey:req.params.roundKey,claimId:req.params.claimId,provenance});
  app.get('/v1/opportunity-rounds/:roundKey/claims/:claimId/continuation',async(req:Request,res:Response,next:NextFunction)=>{try{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
    const holder=await requireContributor(req,store),query=querySchema.parse(req.query);
    res.json(await readOriginalContinuation(store,scope(req,query.provenance),holder,query.operationKey));
  }catch(error){next(error);}});
  app.post('/v1/opportunity-rounds/:roundKey/claims/:claimId/continuation/submissions',async(req:Request,res:Response,next:NextFunction)=>{try{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Robots-Tag','noindex, nofollow');
    const holder=await requireContributor(req,store),body=parseBody(submitBodySchema,req.body),target=scope(req,body.provenance);
    const result=await opportunity.submit(target.roundKey,target.claimId,body,holder,requireIdempotencyKey(req.header('idempotency-key')),{requireContinuationScope:true});
    // No raw canonical evidence, credential, personal label or reward in the transport acknowledgement.
    res.status(result.statusCode).json({acknowledged:true});
  }catch(error){next(error);}});
}
