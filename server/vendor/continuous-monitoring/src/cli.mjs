import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MonitorStore } from './store.mjs';
import { createApi } from './api.mjs';
import { tick } from './worker.mjs';
import { ServiceError, requireThat, object } from './errors.mjs';

function privateJson(file) {
  requireThat(file && (statSync(file).mode & 0o077) === 0 && statSync(file).isFile(), 'config_requires_private_file');
  return JSON.parse(readFileSync(file, 'utf8'));
}
export async function main(args) {
  process.umask(0o077);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node src/cli.mjs <serve|tick|provision|revoke|maintenance> --config PRIVATE_FILE\n'
      + 'provision also requires --grant PRIVATE_FILE; revoke requires --tenant ID.\n'
      + 'serve binds loopback; tick performs bounded public GETs without payments. No command installs a supervisor.\n');
    return;
  }
  const command = args[0], configIndex = args.indexOf('--config');
  const configFile = configIndex >= 0 ? args[configIndex + 1] : process.env.MONITOR_CONFIG;
  const input = privateJson(configFile);
  object(input, ['database', 'host', 'port', 'options']);
  requireThat(typeof input.database === 'string' && input.database !== ':memory:', 'durable_database_required');
  const database = path.resolve(path.dirname(path.resolve(configFile)), input.database);
  const store = new MonitorStore(database, input.options);
  if (command === 'serve') {
    requireThat((input.host ?? '127.0.0.1') === '127.0.0.1', 'loopback_api_bind_required');
    const server = createApi(store);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(input.port ?? 8791, '127.0.0.1', resolve); });
    process.stdout.write(`${JSON.stringify({ ready: true, host: '127.0.0.1', port: server.address().port })}\n`);
    let closing = false;
    const close = () => {
      if (closing) return; closing = true;
      server.close(() => store.close());
      server.closeIdleConnections();
    };
    process.once('SIGTERM', close); process.once('SIGINT', close);
    return;
  }
  try {
    if (command === 'tick') {
      const result = await tick(store);
      process.stdout.write(`${JSON.stringify({ recovered: result.recovered.length, completed: result.completed.length,
        outcomes: result.completed.map(item => item.outcome) })}\n`);
    } else if (command === 'provision') {
      const index = args.indexOf('--grant');
      const result = store.provision(privateJson(index >= 0 ? args[index + 1] : undefined));
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (command === 'revoke') {
      const index = args.indexOf('--tenant');
      requireThat(index >= 0 && /^[A-Za-z0-9_-]{1,64}$/.test(args[index + 1]), 'tenant_required');
      store.revoke(args[index + 1]);
      process.stdout.write('{"revoked":true}\n');
    } else if (command === 'maintenance') {
      store.recover(Date.now()); store.prune(Date.now());
      store.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum(256);');
      process.stdout.write('{"maintenance":true}\n');
    } else throw new ServiceError('command_required_serve_tick_provision_revoke_maintenance');
  } finally { store.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({ error: error instanceof ServiceError ? error.code : 'command_failed' })}\n`);
    process.exitCode = 1;
  });
}
