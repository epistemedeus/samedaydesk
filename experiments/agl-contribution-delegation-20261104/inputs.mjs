// Synthetic needs and artifacts for this prototype only.
// These bytes are not the participation canary vector and are not loaded from fixtures.
import {FEE_BPS, ROUNDING_PROFILE, feePerCapture, quoteEconomics} from '../../vendor/hosted-wallet-market/src/fee.mjs';
import {proposalFrom} from '../../vendor/hosted-wallet-market/src/accepted-work-publication.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';

export const RIGHTS_X = Object.freeze({
  license: 'CC0-1.0',
  scope: 'synthetic-or-authorized-reusable-artifact',
  attribution: 'SYNTHETIC lab roster rename',
});

export const RIGHTS_DELEGATION = Object.freeze({
  license: 'CC0-1.0',
  scope: 'synthetic-or-authorized-reusable-artifact',
  attribution: 'SYNTHETIC lab dock handoff',
});

export const NEED_X = Object.freeze({
  title: 'SYNTHETIC impl X roster rename',
  summary: 'Synthetic requester A asks for a roster field rename on implementation X. No payout and no commission.',
  criterion: 'rename-roster-fields',
});

export const NEED_Y = Object.freeze({
  title: 'SYNTHETIC impl Y roster apply',
  summary: 'Synthetic requester C applies an accepted rename to its own changed roster row on implementation Y.',
  criterion: 'apply-roster-rename',
});

export const NEED_DELEGATION = Object.freeze({
  title: 'SYNTHETIC dock handoff label',
  summary: 'Synthetic requester A asks contributor B to label one dock handoff. Unfunded delegation with no payout.',
  criterion: 'label-dock-handoff',
});

export const NEED_STRANGER = Object.freeze({
  title: 'SYNTHETIC stranger decoy need',
  summary: 'Synthetic stranger D posts a decoy need used only to attempt an unauthorized handback.',
  criterion: 'stranger-decoy-need',
});

export const CHANGED_INPUT = Object.freeze({
  crew_code: 'SYN-Y-441',
  shift_window: 'late',
  dock: 'north',
});

export const EXPECTED_APPLIED = Object.freeze({
  workerId: 'SYN-Y-441',
  windowLabel: 'late',
});

const ROSTER_BODY = Object.freeze({
  schema: 'agl.synthetic.shift-roster-rename.v1',
  implementation: 'X',
  renames: [
    {from: 'crew_code', to: 'workerId'},
    {from: 'shift_window', to: 'windowLabel'},
  ],
  sampleInput: {crew_code: 'SYN-X-SAMPLE', shift_window: 'dawn'},
  sampleOutput: {workerId: 'SYN-X-SAMPLE', windowLabel: 'dawn'},
});

export function evidenceX() {
  return {
    kind: 'usable',
    businessResult: JSON.stringify(ROSTER_BODY),
    attempts: [{
      action: 'Rename synthetic roster fields for implementation X',
      result: 'crew_code and shift_window map to workerId and windowLabel',
      evidence: 'Synthetic roster rename included in businessResult',
    }],
    criterionResults: [{
      criterionId: NEED_X.criterion,
      observation: 'The synthetic sample row keeps both renamed fields',
      passed: true,
    }],
    nextDecision: 'A later requester may apply this rename to a different roster row after an explicit grant.',
  };
}

export function evidenceDelegation() {
  return {
    kind: 'usable',
    businessResult: JSON.stringify({
      schema: 'agl.synthetic.dock-handoff-label.v1',
      implementation: 'delegation',
      label: 'north-dock-late-window',
      note: 'Synthetic handoff label for one unfunded delegation.',
    }),
    attempts: [{
      action: 'Label the synthetic dock handoff',
      result: 'One ordinary label was written for the dock note',
      evidence: 'Synthetic label north-dock-late-window',
    }],
    criterionResults: [{
      criterionId: NEED_DELEGATION.criterion,
      observation: 'The synthetic note received one dock label and no payment field',
      passed: true,
    }],
    nextDecision: 'Requester A can accept or reject this unfunded label. No fee is collected on this profile.',
  };
}

// Ordinary data copy. The received artifact is JSON, and this function does not evaluate it.
export function applyRosterRename(evidence, changedInput) {
  const body = JSON.parse(evidence.businessResult);
  if (body.schema !== ROSTER_BODY.schema || body.implementation !== 'X') {
    throw new Error('artifact_schema_refused');
  }
  if (!Array.isArray(body.renames) || body.renames.length !== 2) throw new Error('rename_list_refused');
  const applied = {};
  for (const rule of body.renames) {
    if (!rule || typeof rule.from !== 'string' || typeof rule.to !== 'string') throw new Error('rename_rule_refused');
    if (!Object.hasOwn(changedInput, rule.from)) throw new Error('changed_input_field_missing');
    applied[rule.to] = changedInput[rule.from];
  }
  return {
    implementation: 'Y',
    applied,
    sampleInput: body.sampleInput,
    sampleOutput: body.sampleOutput,
    unmapped: Object.keys(changedInput).filter(key => !body.renames.some(rule => rule.from === key)),
  };
}

export function handbackDecision(applied) {
  return `Applied implementation X rename to implementation Y row ${applied.workerId}. workerId ${applied.workerId} windowLabel ${applied.windowLabel}.`;
}

// Local reading of the installed fee module. Nothing here is quoted, captured, or stored.
export function unsentFeeObservation(gross = '2500000', railCost = '0') {
  const economics = quoteEconomics({gross, railCost});
  return {
    schema: 'agl.synthetic.unsent-fee-observation.v1',
    module: 'vendor/hosted-wallet-market/src/fee.mjs',
    feeBps: FEE_BPS,
    roundingProfile: ROUNDING_PROFILE,
    grossAtomic: economics.grossAtomic,
    railCostAtomic: economics.railCostAtomic,
    platformFeeAtomic: economics.platformFeeAtomic,
    contributorNetAtomic: economics.contributorNetAtomic,
    feePerCapture: feePerCapture(gross),
    thisQuoteFeeIsExactFivePercent: economics.thisQuoteFeeIsExactFivePercent,
    exactFivePercentAtEveryAtomicAmount: economics.exactFivePercentAtEveryAtomicAmount,
    persisted: false,
    moneyMoved: false,
    settlementSubmitted: false,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codeOf(error) {
  return error?.code || error?.codeName || error?.message || 'unknown';
}

function publicationInput(row, summary, publicArtifact, consent = true) {
  return {
    taskId: row.id,
    termsDigest: row.voluntary.termsDigest,
    expectedRevision: row.voluntary.revision,
    summary,
    summaryDigest: digest(summary),
    publicArtifact,
    publicArtifactDigest: digest(publicArtifact),
    rightsDigest: digest(row.voluntary.terms.rights),
    artifactDigest: row.voluntary.artifact.digest,
    publicationConsent: consent,
  };
}

// Calls the installed publication checker on a clone. It does not write a route or a row.
export function publicationFence(row) {
  const copy = clone(row);
  const clean = 'A chosen consumer may request the accepted roster rename.';
  const privateSummary = `${row.spec.title} stays on the private task.`;
  const privateKeyArtifact = {requesterId: 'synthetic-label'};
  const privateTextArtifact = {note: row.spec.summary};
  const probe = (summary, artifact, consent) => {
    try {
      proposalFrom(clone(copy), publicationInput(copy, summary, artifact, consent));
      return null;
    } catch (error) {
      return codeOf(error);
    }
  };
  return {
    cleanSummary: clean,
    cleanAccepted: probe(clean, {note: 'Roster rename for a later chosen consumer.'}, true) === null,
    privateSummaryCode: probe(privateSummary, {note: 'Roster rename for a later chosen consumer.'}, true),
    privateKeyCode: probe(clean, privateKeyArtifact, true),
    privateTextCode: probe(clean, privateTextArtifact, true),
    missingConsentCode: probe(clean, {note: 'Roster rename for a later chosen consumer.'}, false),
  };
}
