// Both-party public summary of one existing voluntary task. The task row's
// voluntary JSON is the only publication record. Acceptance, a private export
// grant, signup, or an internal QA flag does not publish it.
import {createHash} from 'node:crypto';
import {digest, requireThat} from '../runtime/agent-economy-foundation/dist/index.js';

export const PUBLICATION_SCHEMA = 'pilot.machine-market.accepted-work-publication.v1';
export const PROPOSAL_SCHEMA = 'pilot.machine-market.accepted-work-proposal.v1';
export const ACCEPTED_WORK_MEASURE = Object.freeze({
  verification: 'server_observed',
  acquisition: 'unknown',
  externalUse: false,
  paidWork: false,
  uniquePrincipal: null,
});
const PRIVATE_KEYS = new Set(['requesterid','contributorid','accountid','amount','reward','evidence','review','reason','password','cookie','secret','payout','tenantid','origin']);

export function acceptedWorkEventId(taskId, sourceSha256, nowMs, operation) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return createHash('sha256').update(String(taskId) + '\0' + day + '\0' + String(sourceSha256) + '\0' + String(operation)).digest('hex');
}

/** Plain public copy only. Mirrors the contributor-journey publication fence
 * without taking that showcase ledger as a second source of truth. */
export function publicationText(value, max) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || Buffer.byteLength(value) > max) return false;
  const normalized = value.normalize('NFKC');
  if (/\b(?:ew_ctr|ocl|oclm|osub|oobl)_[A-Za-z0-9_-]{8,}/i.test(normalized)) return false;
  if (/%[0-9a-f]{2}|&#(?:x[0-9a-f]+|\d+);?|&[a-z][a-z0-9]{1,31};|\\(?:u(?:[0-9a-f]{4}|\{[0-9a-f]{1,6}\})|x[0-9a-f]{2}|[0-7]{1,3})/i.test(normalized)) return false;
  if (/[<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(normalized)) return false;
  if (/(?:https?:|mailto:|ipfs:|data:|:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|io|net|eth|xyz)\b)/i.test(normalized)) return false;
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized)) return false;
  if (/(?:0x)?[0-9a-f]{40,}/i.test(normalized)) return false;
  if (/\b[1-9A-HJ-NP-Za-km-z]{32,88}\b/.test(normalized)) return false;
  if (/(?:[$€£¥]|\b(?:USDC|USDT|USD|EUR|GBP|BTC|ETH|SOL|wei|satoshis?)\b)/i.test(normalized)) return false;
  if (/(?:\b(?:reward|payment|payout|paid|amount|atomic|units)\s*(?:is|of|:|=)?\s*\d|\d\s*(?:atomic(?:\s+units)?|dollars?|cents?|tokens?|coins?)\b)/i.test(normalized)) return false;
  if (/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|Bearer\s+\S+|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/i.test(normalized)) return false;
  return true;
}

function collectStrings(value, tokens, depth) {
  if (typeof value === 'string') {
    if (value.length >= 8) tokens.push(value);
    return;
  }
  if (!value || typeof value !== 'object' || depth > 8) return;
  for (const child of Object.values(value)) collectStrings(child, tokens, depth + 1);
}

export function forbiddenTokens(row) {
  const v = row?.voluntary && typeof row.voluntary === 'object' ? row.voluntary : {};
  const spec = row?.spec && typeof row.spec === 'object' ? row.spec : {};
  const tokens = [];
  const add = value => { if (typeof value === 'string' && value.length >= 8) tokens.push(value); };
  add(row?.requester_id);
  add(v.terms?.requesterId);
  add(v.terms?.contributorId);
  add(v.terms?.tenantId);
  add(spec.title);
  add(spec.summary);
  if (Array.isArray(spec.criteria)) spec.criteria.forEach(add);
  add(v.review?.reason);
  if (v.artifact?.evidence) {
    collectStrings(v.artifact.evidence, tokens, 0);
    const dumped = JSON.stringify(v.artifact.evidence);
    if (dumped.length >= 8) tokens.push(dumped);
  }
  return tokens;
}

function privateHit(value, row) {
  if (value === row?.requester_id || value === row?.voluntary?.terms?.contributorId) return true;
  if (value === row?.spec?.summary || value === row?.spec?.title) return true;
  const normalized = value.normalize('NFKC').toLowerCase();
  return forbiddenTokens(row).some(token => normalized.includes(String(token).normalize('NFKC').toLowerCase()));
}

function assertCopy(value, max, row) {
  requireThat(publicationText(value, max), 'publication_refused');
  requireThat(!privateHit(value, row), 'private_field_refused');
}

function assertArtifact(value, row) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'publication_refused');
  const evidence = row.voluntary?.artifact?.evidence;
  if (evidence) requireThat(digest(value) !== digest(evidence), 'private_evidence_refused');
  const canonical = JSON.stringify(value);
  requireThat(Buffer.byteLength(canonical) <= 4096, 'publication_refused');
  const strings = [];
  const walk = (node, depth) => {
    requireThat(depth <= 6, 'publication_refused');
    if (typeof node === 'string') {
      requireThat(Buffer.byteLength(node) <= 500, 'publication_refused');
      strings.push(node);
      return;
    }
    if (node === null || typeof node === 'boolean') return;
    requireThat(node && typeof node === 'object' && !Array.isArray(node), 'publication_refused');
    const keys = Object.keys(node);
    requireThat(keys.length <= 40, 'publication_refused');
    for (const key of keys) {
      requireThat(!PRIVATE_KEYS.has(key.toLowerCase()), 'private_field_refused');
      requireThat(key.length > 0 && key.length <= 64 && publicationText(key, 64), 'publication_refused');
      walk(node[key], depth + 1);
    }
  };
  walk(value, 1);
  requireThat(strings.length <= 40, 'publication_refused');
  for (const text of strings) assertCopy(text, 500, row);
}

export function proposalFrom(row, input) {
  const v = row?.voluntary;
  requireThat(input?.publicationConsent === true, 'publication_consent_required');
  requireThat(v?.review?.accepted === true && v.artifact && v.terms, 'not_accepted');
  requireThat(typeof input.summary === 'string', 'invalid_input');
  requireThat(input.publicArtifact === null || (input.publicArtifact && typeof input.publicArtifact === 'object' && !Array.isArray(input.publicArtifact)), 'publication_refused');
  requireThat(input.summaryDigest === digest(input.summary), 'publication_digest_mismatch');
  requireThat(input.publicArtifactDigest === digest(input.publicArtifact), 'publication_digest_mismatch');
  requireThat(input.termsDigest === v.termsDigest, 'voluntary_terms_changed');
  requireThat(input.rightsDigest === digest(v.terms.rights), 'publication_digest_mismatch');
  requireThat(input.artifactDigest === v.artifact.digest && digest(v.artifact.evidence) === v.artifact.digest, 'artifact_changed');
  assertCopy(input.summary, 800, row);
  const rights = v.terms.rights;
  requireThat(rights && rights.license === 'CC0-1.0' && rights.scope === 'synthetic-or-authorized-reusable-artifact', 'voluntary_rights_required');
  assertCopy(rights.attribution, 512, row);
  if (input.publicArtifact !== null) assertArtifact(input.publicArtifact, row);
  const proposal = {
    schema: PROPOSAL_SCHEMA,
    summary: input.summary,
    summaryDigest: input.summaryDigest,
    publicArtifact: input.publicArtifact,
    publicArtifactDigest: input.publicArtifactDigest,
    termsDigest: v.termsDigest,
    rightsDigest: digest(v.terms.rights),
    artifactDigest: v.artifact.digest,
  };
  return {proposal, proposalDigest: digest(proposal)};
}

export function applyPermit(row, actorId, input) {
  const v = row.voluntary;
  const {proposal, proposalDigest} = proposalFrom(row, input);
  const side = actorId === row.requester_id ? 'requester' : actorId === v.terms.contributorId ? 'contributor' : null;
  requireThat(side, 'forbidden');
  const prior = v.publication && typeof v.publication === 'object' ? v.publication : {};
  const requesterDigest = side === 'requester' ? proposalDigest : (prior.requesterDigest ?? null);
  const contributorDigest = side === 'contributor' ? proposalDigest : (prior.contributorDigest ?? null);
  const both = requesterDigest === proposalDigest && contributorDigest === proposalDigest;
  v.publication = {
    schema: PUBLICATION_SCHEMA,
    proposal,
    proposalDigest,
    requesterDigest,
    contributorDigest,
    withdrawn: both ? null : (prior.withdrawn ?? null),
    publicationConsent: true,
  };
  return both && publicationVisible(row);
}

export function applyPublicationWithdrawal(row, actorId, reason) {
  const v = row?.voluntary;
  requireThat(v?.terms, 'voluntary_unavailable');
  requireThat(actorId === row.requester_id || actorId === v.terms.contributorId, 'forbidden');
  const prior = v.publication && typeof v.publication === 'object' ? v.publication : {};
  v.publication = {
    schema: PUBLICATION_SCHEMA,
    proposal: prior.proposal ?? null,
    proposalDigest: prior.proposalDigest ?? null,
    requesterDigest: null,
    contributorDigest: null,
    withdrawn: {actorId, reason},
    publicationConsent: prior.publicationConsent === true,
  };
  return false;
}

function copyStillPublic(row) {
  const proposal = row.voluntary.publication.proposal;
  if (!publicationText(proposal.summary, 800) || privateHit(proposal.summary, row)) return false;
  const attribution = row.voluntary.terms?.rights?.attribution;
  if (!publicationText(attribution, 512) || privateHit(attribution, row)) return false;
  if (proposal.publicArtifact == null) return true;
  try { assertArtifact(proposal.publicArtifact, row); return true; }
  catch { return false; }
}

export function publicationVisible(row) {
  const v = row?.voluntary;
  if (!v || v.withdrawn || !v.terms || v.review?.accepted !== true || !v.artifact) return false;
  if (digest(v.terms) !== v.termsDigest || digest(v.artifact.evidence) !== v.artifact.digest) return false;
  if (!row.spec || digest(row.spec) !== v.terms.specDigest) return false;
  if (v.terms.taskId !== row.id || v.terms.requesterId !== row.requester_id) return false;
  const pub = v.publication;
  if (!pub || pub.schema !== PUBLICATION_SCHEMA || pub.withdrawn || pub.publicationConsent !== true) return false;
  const proposal = pub.proposal;
  if (!proposal || proposal.schema !== PROPOSAL_SCHEMA) return false;
  if (pub.requesterDigest !== pub.proposalDigest || pub.contributorDigest !== pub.proposalDigest) return false;
  if (digest(proposal) !== pub.proposalDigest) return false;
  if (proposal.termsDigest !== v.termsDigest || proposal.rightsDigest !== digest(v.terms.rights)) return false;
  if (proposal.artifactDigest !== v.artifact.digest) return false;
  if (proposal.summaryDigest !== digest(proposal.summary)) return false;
  if (proposal.publicArtifactDigest !== digest(proposal.publicArtifact ?? null)) return false;
  return copyStillPublic(row);
}

const CONTINUATION = Object.freeze({
  account: '/v1/account/signup',
  interest: '/v1/market/interest',
  chosenConsumer: '/v1/market/grantVoluntary',
  permissionedExport: '/v1/market/exportVoluntary',
});

export function publicView(row) {
  if (!publicationVisible(row)) return null;
  const proposal = row.voluntary.publication.proposal;
  const rights = row.voluntary.terms.rights;
  return {
    taskId: row.id,
    summary: proposal.summary,
    summaryDigest: proposal.summaryDigest,
    termsDigest: proposal.termsDigest,
    rightsDigest: proposal.rightsDigest,
    rights: {license: rights.license, scope: rights.scope, attribution: rights.attribution},
    artifactDigest: proposal.artifactDigest,
    publicArtifactDigest: proposal.publicArtifactDigest,
    continuation: {...CONTINUATION},
  };
}

export function publicArtifactView(row) {
  const view = publicView(row);
  const artifact = row?.voluntary?.publication?.proposal?.publicArtifact;
  if (!view || artifact == null) return null;
  return {...view, publicArtifact: artifact};
}
