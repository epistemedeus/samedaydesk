// Test-only preload for the 0.3.1 cold client. It replaces https.request with an
// in-process stub so no socket is opened. Each request is appended to a log.
// The permit route checks the body with the real proposalFrom and the real
// exact key list of permitAcceptedWork; receipts use the real coldReceipt.
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {appendFileSync, readFileSync} from 'node:fs';
import {digest} from '../../runtime/agent-economy-foundation/dist/index.js';
import {coldReceipt, coldRequest} from '../../runtime/agent-economy-market/src/cold-receipt.mjs';
import {proposalFrom} from '../../src/accepted-work-publication.mjs';

const config = JSON.parse(readFileSync(process.env.COLD_STUB_CONFIG, 'utf8'));
const PREFIX = '/api/neomorphic-contributor-journey';
export const PERMIT_KEYS = ['taskId','termsDigest','expectedRevision','sourceSha256','hostSha256','summary','summaryDigest',
  'publicArtifact','publicArtifactDigest','rightsDigest','artifactDigest','publicationConsent'];
const flags = {funding:'voluntary', paymentAuthority:'none', paidWork:false, debtCreated:false, verification:'requester_decision', independence:'unknown'};

export function acceptedRow(cfg) {
  const evidence = {kind:'usable', criterionResults:[{criterionId:'public-example', passed:true}], note:'fixture evidence body'};
  const spec = {title:'Fixture need title', summary:'Fixture need summary text', criteria:['public-example'], payableKinds:['usable']};
  const terms = {schema:'pilot.machine-market.voluntary-terms.v1', taskId:cfg.taskId, tenantId:cfg.tenant, requesterId:'requester-fixture-1',
    contributorId:'contributor-fixture-1', specDigest:digest(spec), sourceSha256:cfg.sourceSha256, hostSha256:cfg.hostSha256,
    rights:{license:'CC0-1.0', scope:'synthetic-or-authorized-reusable-artifact', attribution:'Fixture contributor'}};
  return {id:cfg.taskId, requester_id:'requester-fixture-1', spec,
    voluntary:{revision:4, terms, termsDigest:digest(terms), assented:true, artifact:{evidence, digest:digest(evidence)},
      review:{accepted:true, exportAuthorized:true, artifactDigest:digest(evidence), requesterId:'requester-fixture-1'}}};
}

function route(method, path, body, headers) {
  const actor = {tenantId:config.tenant, actorId:config.actorId};
  if (method === 'GET' && path === '/v1/market/profile') {
    return [200, {ok:true, value:{capability:{origin:config.origin, tenant:config.tenant, money:'unfunded', sourceSha256:config.sourceSha256, hostSha256:config.hostSha256},
      signerAuthority:false, participation:{protocol:'voluntary-artifact-v1'},
      mutationReceipts:{schema:'pilot.machine-market.cold-mutation-receipt.v1', actions:['post','interest'], readback:'/v1/market/readback'},
      ...(config.acceptedWorkPublic ? {acceptedWork:{schema:'pilot.machine-market.accepted-work-publication.v1', publicReads:'0', paidWork:false, signerAuthority:false, discovery:'/v1/market/accepted-work'}} : {})}}];
  }
  if (method === 'GET' && path.startsWith('/v1/market/accepted-work')) {
    if (!config.acceptedWorkPublic) return [404, {ok:false, code:'not_found'}];
    return [200, {ok:true, value:{items:config.acceptedItems ?? [], nextCursor:null, acceptedWorkPublic:true, publicReads:'0', paidWork:false, signerAuthority:false}}];
  }
  if (method === 'POST' && path === '/v1/market/post') {
    const operationId = headers['idempotency-key'];
    const criteria = body.criteria;
    if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 16 || new Set(criteria).size !== criteria.length) return [409, {ok:false, code:'invalid_input'}];
    const taskId = 'market-' + digest({actor, action:'post', id:operationId});
    const result = {taskId, spec:{...body, slotLimit:1, milestoneLimit:1, cohort:'unknown'}, state:'unfunded_interest'};
    return [200, {ok:true, value:{action:'post', result:coldReceipt(coldRequest(config.origin, actor, 'post', body, operationId), result)}}];
  }
  if (method === 'POST' && path === '/v1/market/readVoluntary') {
    const row = acceptedRow(config), v = row.voluntary;
    return [200, {ok:true, value:{action:'readVoluntary', result:{taskId:row.id, revision:v.revision, termsDigest:v.termsDigest, state:'accepted',
      artifactDigest:v.artifact.digest, ...flags, terms:v.terms, spec:row.spec, review:v.review, evidence:v.artifact.evidence}}}];
  }
  if (method === 'POST' && path === '/v1/market/permitAcceptedWork') {
    if (!config.acceptedWorkPublic) return [409, {ok:false, code:'accepted_work_public_unavailable'}];
    const row = acceptedRow(config), v = row.voluntary;
    if (Object.keys(body).sort().join('|') !== [...PERMIT_KEYS].sort().join('|')) return [409, {ok:false, code:'invalid_input'}];
    if (body.expectedRevision !== v.revision) return [409, {ok:false, code:'voluntary_revision_changed'}];
    try { proposalFrom(row, body); } catch (error) { return [409, {ok:false, code:error.code || 'publication_refused'}]; }
    const result = {taskId:row.id, revision:v.revision + 1, termsDigest:v.termsDigest, state:'accepted', artifactDigest:v.artifact.digest, ...flags, acceptedWorkVisible:false};
    return [200, {ok:true, value:{action:'permitAcceptedWork', result:coldReceipt(coldRequest(config.origin, actor, 'permitAcceptedWork', body, headers['idempotency-key']), result)}}];
  }
  return [404, {ok:false, code:'not_found'}];
}

https.request = (url, options, callback) => {
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.end = data => {
    const parsed = new URL(url);
    const path = parsed.pathname.slice(PREFIX.length) + parsed.search;
    const body = data ? JSON.parse(data.toString('utf8')) : undefined;
    appendFileSync(process.env.COLD_STUB_LOG, JSON.stringify({method:options.method, path, body, headers:options.headers}) + '\n');
    const [status, payload] = route(options.method, path.split('?')[0], body, options.headers);
    const res = new EventEmitter();
    res.statusCode = status; res.headers = {}; res.rawHeaders = []; res.complete = true;
    queueMicrotask(() => {
      callback(res);
      res.emit('data', Buffer.from(JSON.stringify(payload)));
      res.complete = true;
      res.emit('end');
    });
  };
  return req;
};
