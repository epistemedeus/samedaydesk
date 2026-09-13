import { CALLBACK_SCHEMA } from './pins.mjs';
import { digestNamedBytes } from './receipt-shape.mjs';
import { hashTerms, stableStringify } from './hash-terms.mjs';
import { refuse } from './errors.mjs';

export function assertCallbackIdentity(payload, destination) {
  const terms = payload?.deliveryTerms;
  if (!payload || payload.schema !== CALLBACK_SCHEMA || !terms ||
      hashTerms(terms) !== payload.termsHash ||
      stableStringify(payload.callbackDestination) !== stableStringify(destination) ||
      terms.callbackDestination !== destination.canonical ||
      !Array.isArray(payload.outputs) || !payload.outputs.length ||
      digestNamedBytes(payload.outputs) !== payload.outputsDigest ||
      terms.outputsDigest !== payload.outputsDigest || terms.jobId !== payload.jobId ||
      terms.engineArchiveIdentity !== payload.engineArchiveIdentity ||
      terms.sample !== payload.sample || terms.fundingState !== payload.fundingState ||
      stableStringify(terms.artifact) !== stableStringify(payload.artifact)) {
    refuse('callback-identity-mismatch', 'Callback terms, output bytes, or destination disagree');
  }
}
