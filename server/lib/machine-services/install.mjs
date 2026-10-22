import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { PgPort, installedDatabaseUrl, SCHEMAS } from './postgres.mjs';
import { openInstalledStore } from './mount.mjs';
import { readPrivateJson } from '../../vendor/machine-gateway/src/config.mjs';
import { prepareMachineConfig } from './private-config.mjs';

export async function install(args, env = process.env) {
  const command = args[0];
  if (!['prepare', 'migrate', 'inspect', 'provision', 'revoke', 'maintenance'].includes(command)) throw new Error('invalid_command');
  env = prepareMachineConfig(env, { grant: command === 'provision' });
  if (command === 'prepare') return { prepared: true, deployed: false };
  if (command === 'migrate' || command === 'inspect') {
    for (const service of ['gateway', 'monitor']) {
      const port = new PgPort({ databaseUrl: installedDatabaseUrl(env), service });
      try {
        if (command === 'migrate') await port.migrate();
        else await port.checkReady();
      } finally { await port.close(); }
    }
    return { ok: true, adapter: 'postgres', schemas: SCHEMAS, migrated: command === 'migrate', deployed: false };
  }
  const store = await openInstalledStore('monitor', env);
  try {
    if (command === 'provision') {
      const index = args.indexOf('--grant-file');
      const grant = readPrivateJson(index < 0 ? env.MONITOR_GRANT_FILE : args[index + 1]);
      if ((grant.plan || 'free') !== 'free') throw new Error('free_grant_required');
      return await store.provision(grant);
    }
    if (command === 'revoke') {
      const index = args.indexOf('--tenant'), id = index < 0 ? undefined : args[index + 1];
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id || '')) throw new Error('invalid_tenant');
      await store.revoke(id); return { revoked: true, charged: false };
    }
    const recovered = await store.recover(Date.now()); await store.prune(Date.now());
    return { recovered: recovered.length, charged: false };
  } finally { await store.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  install(process.argv.slice(2)).then(value => console.log(JSON.stringify(value)), () => {
    console.error('machine_install_refused'); process.exitCode = 1;
  });
}
