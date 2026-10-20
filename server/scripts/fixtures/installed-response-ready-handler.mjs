// lsnode child for one ready plaintext pipe. The parent prepares the disposable
// store and passes a fixture env file. This process mounts the real SDS app.
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createSdsApp} from '../../app.js';

export async function start() {
  const socketPath = process.env.ROOT1156_SOCK;
  if (!socketPath || !socketPath.startsWith('/tmp/')) throw new Error('unix socket required');
  const env = JSON.parse(readFileSync(process.env.ROOT1156_ENV_FILE, 'utf8'));
  const app = createSdsApp({
    hostedWalletMarket: {
      mode: 'private', label: 'PRIVATE', chain: 'eip155:8453', payments: 'off', publicReads: '0',
      fundedTasks: 'off', humanAssets: 'off', tls: 'verified-edge', origin: env.HOSTED_WALLET_MARKET_ORIGIN,
      tenant: env.HOSTED_WALLET_MARKET_TENANT, earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market',
      listenHost: '127.0.0.1', databaseUrl: env.CONTRIBUTOR_JOURNEY_DATABASE_URL, rpcUrl: env.HOSTED_WALLET_MARKET_RPC,
      feeRecipient: env.HOSTED_WALLET_MARKET_FEE_RECIPIENT, settlementToken: env.HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN,
      replayKey: env.CONTRIBUTOR_JOURNEY_REPLAY_KEY, ownerToken: env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN, env,
    },
    neomorphicContributorJourney: {env},
    neomorphicOpportunity: {env: {}},
    correspondence: {env: {}},
    hostedUsefulJourney: {env: {}},
    managedWatch: {env: {}},
  });
  const market = app.get('hostedWalletMarket');
  await market.opened;
  const journey = app.get('neoContributorJourney');
  await journey.ready();
  if (journey.state.status !== 'ready') {
    const diagnostic = journey.state.diagnostic;
    console.error(`NOT_READY ${JSON.stringify({
      status: journey.state.status,
      reason: journey.state.reason,
      stage: diagnostic && diagnostic.stage || null,
      code: diagnostic && diagnostic.code || null,
    })}`);
    process.exit(2);
  }
  const server = createServer(app);
  if (!journey.bindListener(server)) throw new Error('listener bind refused');
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolveListen);
  });
  if (process.env.ROOT1156_READY_FILE) writeFileSync(process.env.ROOT1156_READY_FILE, 'ready\n');
  process.stdout.write(`READY ${socketPath}\n`);
}
