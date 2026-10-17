import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const RELATIVE = 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src';

function refused() {
  return Object.assign(new Error('authority_required'), {codeName: 'authority_required', http: 403});
}

/**
 * Existing earned-work owner bearer. Does not call loadConfig, does not store
 * the token, and does not accept a hosted_wallet_market role.
 */
export async function loadOwnerAuthority(sdsRoot) {
  if (typeof sdsRoot !== 'string' || !sdsRoot.startsWith('/') || sdsRoot.includes('\0')) throw refused();
  const base = join(sdsRoot, RELATIVE);
  const config = await import(pathToFileURL(join(base, 'config.js')).href);
  const crypto = await import(pathToFileURL(join(base, 'crypto.js')).href);
  return {
    hashToken: crypto.hashToken,
    verify(token) {
      const owner = process.env.EARNED_WORK_OWNER_TOKEN;
      if (typeof owner !== 'string' || owner.length < 8) throw refused();
      try {
        config.assertOwner(token, {ownerTokenHash: crypto.hashToken(owner)});
      } catch {
        throw refused();
      }
    },
  };
}
