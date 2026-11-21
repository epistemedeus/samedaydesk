import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const SERVING_COMMIT = 'e56c4d84f1c59f02307d5aa9a2c330957a28aa6d';

/** Installed config modules at the serving SDS commit. Names only, never values. */
export const CONTRACT_FILES = Object.freeze([
  'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/contributor-journey/config.js',
  'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src/config.js',
  'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/correspondence/src/config.js',
  'server/lib/neomorphic-contributor-journey-mount.js',
  'server/lib/contributor-managed-mount.js',
  'server/lib/contributor-environment-packet.js',
]);

const ENV_READ = /(?:^|[^A-Za-z0-9_])(?:env|process\.env)\??\.([A-Z][A-Z0-9_]{2,})/g;
const ENV_STRING = /['"](CONTRIBUTOR_(?:JOURNEY|DESK)_[A-Z0-9_]+|CORRESPONDENCE_[A-Z0-9_]+|DATABASE_URL|EARNED_WORK_[A-Z0-9_]+|NEOMORPHIC_OPPORTUNITY_[A-Z0-9_]+)['"]/g;

export function namesFromContractSource(source) {
  const names = new Set();
  for (const match of String(source).matchAll(ENV_READ)) names.add(match[1]);
  for (const match of String(source).matchAll(ENV_STRING)) names.add(match[1]);
  return [...names].sort();
}

export function contractDigest(names) {
  return createHash('sha256').update([...names].sort().join('\n')).digest('hex');
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
}

export function loadInstalledContract({repo, commit = SERVING_COMMIT} = {}) {
  if (!repo) throw Object.assign(new Error('contract_source_required'), {codeName: 'contract_source_required'});
  const resolved = git(repo, ['rev-parse', `${commit}^{commit}`]).trim();
  if (resolved !== SERVING_COMMIT) {
    throw Object.assign(new Error('serving_commit_refused'), {codeName: 'serving_commit_refused'});
  }
  const names = new Set();
  for (const file of CONTRACT_FILES) {
    const source = git(repo, ['show', `${SERVING_COMMIT}:${file}`]);
    for (const name of namesFromContractSource(source)) names.add(name);
  }
  const sorted = [...names].sort();
  if (!sorted.includes('CONTRIBUTOR_JOURNEY_DATABASE_URL') || !sorted.includes('CONTRIBUTOR_JOURNEY_MODE')) {
    throw Object.assign(new Error('contract_incomplete'), {codeName: 'contract_incomplete'});
  }
  if (sorted.some(name => name.startsWith('HOSTED_WALLET_MARKET_'))) {
    throw Object.assign(new Error('contract_overlap'), {codeName: 'contract_overlap'});
  }
  return {names: sorted, digest: contractDigest(sorted), commit: SERVING_COMMIT, files: [...CONTRACT_FILES]};
}

export function assertAdmitted(contractNames, additiveNames) {
  const overlap = [...additiveNames].filter(name => contractNames.includes(name));
  if (overlap.length) {
    throw Object.assign(new Error('preserved_key_overlap'), {codeName: 'preserved_key_overlap', overlap});
  }
  return overlap;
}
