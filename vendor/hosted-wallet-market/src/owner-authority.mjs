import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const RELATIVE = 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src';

function refused() {
  return Object.assign(new Error('authority_required'), {codeName: 'authority_required', http: 403});
}

/**
 * Existing installed contributor owner bearer (standalone earned-work fallback). Does not call loadConfig, does not store
 * the token, and does not accept a hosted_wallet_market role.
 */
export async function loadOwnerAuthority(sdsRoot,{ownerToken=process.env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN ?? process.env.EARNED_WORK_OWNER_TOKEN}={}) {
  if (typeof sdsRoot !== 'string' || !sdsRoot.startsWith('/') || sdsRoot.includes('\0')) throw refused();
  const base = join(sdsRoot, RELATIVE);
  const config = await import(pathToFileURL(join(base, 'config.js')).href);
  const crypto = await import(pathToFileURL(join(base, 'crypto.js')).href);
  const owner=ownerToken; // Capture configured authority once, never select it from a request.
  return {
    hashToken: crypto.hashToken,
    principalId: typeof owner === 'string' && owner.length >= 8 ? crypto.hashToken(owner) : null,
    verify(token) {
      if (typeof owner !== 'string' || owner.length < 8) throw refused();
      try {
        config.assertOwner(token, {ownerTokenHash: crypto.hashToken(owner)});
      } catch {
        throw refused();
      }
    },
  };
}
