// Voluntary continuation of an existing unfunded market task. The market's
// task lock, account authority and operation journal own it. Export grants are
// stored only in ae14_market_voluntary_consumers and bind the accepted terms
// and artifact. Retained/paid consumer rows are not read or deleted here.
// No earned-work funding, obligation, verifier receipt or payment is created.
import {digest, requireThat} from '../runtime/agent-economy-foundation/dist/index.js';
import {readFileSync} from 'node:fs';

export const PARTICIPATION = 'voluntary-artifact-v1';
const ACTIONS = ['offerVoluntary','assentVoluntary','deliverVoluntary','reviewVoluntary',
  'grantVoluntary','withdrawVoluntary','withdrawNeed','readVoluntary','exportVoluntary','useVoluntary','readbackVoluntary'];
const MUTATIONS = ACTIONS.filter(name => !['readVoluntary','exportVoluntary','readbackVoluntary'].includes(name));
const exact = (value, keys) => requireThat(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'invalid_input');
const key = value => requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value), 'invalid_input');
const text = (value, max = 4096) => requireThat(typeof value === 'string' && value.trim().length > 0 &&
  Buffer.byteLength(value) <= max && !value.includes('\0'), 'invalid_input');
const hash = value => requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'invalid_input');
const operationKey = value => {key(value);requireThat(value.length >= 8, 'idempotency_required');};
const roleRequired = (ok,code) => {if(!ok) throw Object.assign(Error(code),{http:403,codeName:code});};
const flags = Object.freeze({funding:'voluntary', paymentAuthority:'none', paidWork:false,
  debtCreated:false, verification:'requester_decision', independence:'unknown'});

export function voluntaryMarket({market, capability}) {
  const store = market.store;
  const enabled = capability.money === 'unfunded' && capability.participation === PARTICIPATION;
  const binding = () => ({sourceSha256:capability.sourceSha256, hostSha256:capability.hostSha256});
  function current(input) {
    requireThat(input.sourceSha256 === capability.sourceSha256 && input.hostSha256 === capability.hostSha256,
      'voluntary_source_changed');
  }
  function terms(row, input) {
    const v = row.voluntary;
    requireThat(v && input.termsDigest === v.termsDigest, 'voluntary_terms_changed');
    requireThat(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision === v.revision, 'voluntary_revision_changed');
    return v;
  }
  const party = (actor, row, v) => requireThat([row.requester_id, v.terms?.contributorId].includes(actor.actorId), 'forbidden');
  const live = v => requireThat(!v.withdrawn, 'voluntary_withdrawn');
  const result = (row, v) => ({taskId:row.id, revision:v.revision, termsDigest:v.termsDigest,
    state:v.withdrawn ? 'withdrawn' : v.review ? (v.review.accepted ? 'accepted' : 'rejected') :
      v.artifact ? 'delivered' : v.assented ? 'assigned' : 'offered',
    artifactDigest:v.artifact?.digest ?? null, ...flags});
  async function save(client, row, v) {
    await client.query(`UPDATE ${store.table('tasks')} SET voluntary=$3 WHERE tenant_id=$1 AND id=$2`,
      [row.tenant_id, row.id, JSON.stringify(v)]);
    return result(row, v);
  }
  async function voluntaryGrant(client, tenantId, taskId, actorId) {
    return (await client.query(`SELECT terms_digest,artifact_digest,granted_revision,operation_id
      FROM ${store.table('voluntary_consumers')} WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3`,
      [tenantId,taskId,actorId])).rows[0] ?? null;
  }
  function grantBindsAccepted(grant, v) {
    return Boolean(grant && v.review?.accepted && v.review.exportAuthorized && v.artifact
      && grant.terms_digest === v.termsDigest && grant.artifact_digest === v.artifact.digest
      && Number.isSafeInteger(grant.granted_revision) && grant.granted_revision >= 1
      && grant.granted_revision <= v.revision && typeof grant.operation_id === 'string' && grant.operation_id.length >= 8);
  }
  async function entitled(client, actor, row, v) {
    live(v);
    const isParty = [row.requester_id,v.terms.contributorId].includes(actor.actorId);
    const grant = await voluntaryGrant(client, actor.tenantId, row.id, actor.actorId);
    requireThat(isParty || grantBindsAccepted(grant, v), 'forbidden');
    requireThat(v.artifact && digest(v.artifact.evidence) === v.artifact.digest, 'retained_evidence_required');
    return isParty;
  }
  async function invoke(req, action, input, operationId) {
    requireThat(enabled, 'voluntary_unavailable');
    exact(input, action === 'readbackVoluntary' ? ['action','input'] : Object.keys(input ?? {}));
    const actor = await market.actor(req);
    const member = await market.member(actor.actorId,actor.tenantId);
    if (['offerVoluntary','reviewVoluntary','grantVoluntary','withdrawNeed'].includes(action))
      roleRequired(member.role === 'requester', 'requester_required');
    if (['assentVoluntary','deliverVoluntary'].includes(action))
      roleRequired(member.role === 'contributor', 'contributor_required');
    if (action === 'readbackVoluntary') {
      requireThat(MUTATIONS.includes(input.action), 'invalid_input');
      operationKey(operationId);
      // The original effect receipt contains only identifiers/digests. Recovery
      // cannot re-expose a withdrawn artifact or execute another mutation.
      return store.coldReadback({origin:capability.origin,actor,action:input.action,input:input.input,
        operationId,legacy:false});
    }
    key(input.taskId);
    if (['readVoluntary','exportVoluntary'].includes(action)) {
      exact(input,['taskId']);
      return store.locked(actor.tenantId,input.taskId,async (row,client) => {
        const v = row.voluntary;
        requireThat(v, 'voluntary_unavailable');
        if (action === 'readVoluntary') {
          party(actor,row,v);
          return {...result(row,v),terms:v.terms,review:v.review ?? null,
            evidence:v.withdrawn ? null : v.artifact?.evidence ?? null};
        }
        const isParty = await entitled(client,actor,row,v);
        requireThat(v.review?.accepted && v.review.exportAuthorized, 'voluntary_export_not_authorized');
        return {...result(row,v),schema:'pilot.machine-market.voluntary-export.v1',terms:v.terms,
          evidence:v.artifact.evidence,review:v.review,relationship:isParty ? 'task_party' : 'authorized_later_consumer'};
      });
    }
    requireThat(MUTATIONS.includes(action), 'invalid_input');
    operationKey(operationId);
    return store.coldMutation({origin:capability.origin,actor,action,input,operationId,moneyProvenance:'unavailable'},async client => {
      const row = await store.task(actor.tenantId,input.taskId,client,true);
      // A funded or quoted task never enters this continuation. Conversely the
      // quote writer refuses a task once it has voluntary terms.
      requireThat(!row.current_quote && !row.selected_quote && !await store.hasFunding(actor.tenantId,row.id,client), 'voluntary_unfunded_required');
      if (action === 'withdrawNeed') {
        exact(input,['taskId','reason']); market.owner(actor,row); text(input.reason);
        requireThat(!row.voluntary, 'voluntary_terms_required');
        return save(client,row,{revision:1,terms:null,termsDigest:null,withdrawn:{actorId:actor.actorId,reason:input.reason}});
      }
      if (action === 'offerVoluntary') {
        exact(input,['taskId','contributorId','rights','authorizedToRequest','sourceSha256','hostSha256']);
        market.owner(actor,row); current(input); key(input.contributorId);
        requireThat(input.authorizedToRequest === true && input.contributorId !== actor.actorId, 'independent_role_required');
        roleRequired((await market.member(input.contributorId,actor.tenantId)).role === 'contributor', 'contributor_required');
        exact(input.rights,['license','scope','attribution']);
        requireThat(input.rights.license === 'CC0-1.0' && input.rights.scope === 'synthetic-or-authorized-reusable-artifact', 'voluntary_rights_required');
        text(input.rights.attribution,512);
        requireThat(!row.voluntary, 'voluntary_already_offered');
        const interested = (await client.query(`SELECT 1 FROM ${store.table('interests')} WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3`,
          [actor.tenantId,row.id,input.contributorId])).rows.length;
        requireThat(interested, 'contributor_interest_required');
        const t = {schema:'pilot.machine-market.voluntary-terms.v1',origin:capability.origin,tenantId:actor.tenantId,
          taskId:row.id,requesterId:actor.actorId,contributorId:input.contributorId,specDigest:digest(row.spec),
          rights:input.rights,...binding(),funding:'voluntary',contributionRequired:false,
          paymentAuthority:'none',requesterReviewRequired:true,exportRequiresBothParties:true};
        return save(client,row,{revision:1,terms:t,termsDigest:digest(t),assented:false});
      }
      if (action === 'useVoluntary') {
        exact(input,['taskId','laterTaskId','artifactDigest','decision']);
        const v = row.voluntary; requireThat(v, 'voluntary_unavailable');
        await entitled(client,actor,row,v);
        requireThat(v.review?.accepted && v.review.exportAuthorized, 'voluntary_export_not_authorized');
        requireThat(![row.requester_id,v.terms.contributorId].includes(actor.actorId), 'later_consumer_required');
        key(input.laterTaskId); hash(input.artifactDigest); text(input.decision);
        const later = await store.task(actor.tenantId,input.laterTaskId,client);
        requireThat(later.id !== row.id && later.requester_id === actor.actorId && input.artifactDigest === v.artifact.digest, 'later_task_binding');
        await store.measure(actor.tenantId,row.id,'downstream_use',digest({actor,operationId}),actor.actorId,
          {...input,verification:'authenticated_self_report',independence:'unknown',paidWork:false},client);
        return result(row,v);
      }
      const v = terms(row,input);
      party(actor,row,v);
      if (action === 'withdrawVoluntary') {
        exact(input,['taskId','termsDigest','expectedRevision','reason']); text(input.reason);
        live(v); v.withdrawn = {actorId:actor.actorId,reason:input.reason};
        await client.query(`DELETE FROM ${store.table('voluntary_consumers')} WHERE tenant_id=$1 AND task_id=$2`,[actor.tenantId,row.id]);
      } else {
        live(v); current(input);
        requireThat(v.terms.sourceSha256 === capability.sourceSha256 && v.terms.hostSha256 === capability.hostSha256,
          'voluntary_source_changed');
        requireThat(digest(row.spec) === v.terms.specDigest, 'voluntary_terms_changed');
        const base = ['taskId','termsDigest','expectedRevision','sourceSha256','hostSha256'];
        if (action === 'assentVoluntary') {
          exact(input,[...base,'authorizedToShare']);
          requireThat(actor.actorId === v.terms.contributorId && input.authorizedToShare === true, 'contributor_consent_required');
          requireThat(!v.assented, 'voluntary_already_assented'); v.assented = true;
        } else if (action === 'deliverVoluntary') {
          exact(input,[...base,'evidence']);
          requireThat(actor.actorId === v.terms.contributorId && v.assented && !v.artifact, 'voluntary_assignment_required');
          // Existing market evidence validation rejects caller-supplied receipts
          // and unknown fields; submitted claims never become verifier authority.
          market.evidence(input.evidence,row.spec);
          v.artifact = {evidence:input.evidence,digest:digest(input.evidence)};
        } else if (action === 'reviewVoluntary') {
          exact(input,[...base,'artifactDigest','accepted','exportAuthorized','reason']);
          market.owner(actor,row); hash(input.artifactDigest); text(input.reason);
          requireThat(typeof input.accepted === 'boolean' && typeof input.exportAuthorized === 'boolean' &&
            (!input.exportAuthorized || input.accepted), 'invalid_input');
          requireThat(v.artifact && !v.review && input.artifactDigest === v.artifact.digest, 'artifact_changed');
          if (input.accepted) requireThat(v.artifact.evidence.kind !== 'usable' ||
            v.artifact.evidence.criterionResults.every(x => x.passed), 'criteria_not_met');
          v.review = {requesterId:actor.actorId,artifactDigest:input.artifactDigest,accepted:input.accepted,
            exportAuthorized:input.exportAuthorized,reason:input.reason,authority:'requester_decision'};
        } else if (action === 'grantVoluntary') {
          exact(input,[...base,'consumerId']); market.owner(actor,row); key(input.consumerId);
          requireThat(v.review?.accepted && v.review.exportAuthorized, 'voluntary_export_not_authorized');
          await market.member(input.consumerId,actor.tenantId);
          requireThat(![row.requester_id,v.terms.contributorId].includes(input.consumerId), 'later_consumer_required');
          await client.query(`INSERT INTO ${store.table('voluntary_consumers')}
            (tenant_id,task_id,actor_id,terms_digest,artifact_digest,granted_revision,operation_id)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
            [actor.tenantId,row.id,input.consumerId,v.termsDigest,v.artifact.digest,v.revision,operationId]);
          const saved = await voluntaryGrant(client, actor.tenantId, row.id, input.consumerId);
          requireThat(saved && saved.terms_digest === v.termsDigest && saved.artifact_digest === v.artifact.digest, 'voluntary_grant_conflict');
        } else requireThat(false, 'invalid_input');
      }
      v.revision++;
      return save(client,row,v);
    });
  }
  return {enabled,actions:ACTIONS,invoke,
    contract:enabled ? JSON.parse(readFileSync(new URL('../contracts/voluntary-participation.openapi.json',import.meta.url),'utf8')) : null,
    descriptor:enabled ? {protocol:PARTICIPATION,actions:ACTIONS,contract:'/v1/market/participation-contract',
    rights:'CC0-1.0',maxArtifactBytes:65536,mutationReceipts:'pilot.machine-market.cold-mutation-receipt.v1',
    readback:'/v1/market/readbackVoluntary',...flags} : null};
}
