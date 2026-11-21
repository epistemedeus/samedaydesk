/**
 * Disposable staging harness guard. The deployment profile does not call this.
 * Tests use it so the staging journey cannot be pointed at another database.
 */
export function assertStagingTarget({label, chain, payments, databaseUrl}) {
  if (label !== 'STAGING') throw Object.assign(new Error('label_refused'), {codeName: 'label_refused'});
  if (chain !== 'eip155:31337') throw Object.assign(new Error('chain_refused'), {codeName: 'chain_refused'});
  if (payments !== 'off') throw Object.assign(new Error('payments_refused'), {codeName: 'payments_refused'});
  let url;
  try { url = new URL(databaseUrl); }
  catch { throw Object.assign(new Error('database_refused'), {codeName: 'database_refused'}); }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw Object.assign(new Error('database_refused'), {codeName: 'database_refused'});
  }
  if (url.hostname !== '127.0.0.1' || url.password) {
    throw Object.assign(new Error('database_refused'), {codeName: 'database_refused'});
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const disposable = /^ae14_b_j1_[a-f0-9]+$/.test(name);
  if ((!disposable && !name.includes('staging')) || /prod/i.test(name)) {
    throw Object.assign(new Error('database_refused'), {codeName: 'database_refused'});
  }
  return {host: url.hostname, name};
}
